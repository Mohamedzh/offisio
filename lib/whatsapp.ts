// WhatsApp Cloud API channel (docs/plan/06 6.8). Transport only: the Graph API
// is Meta's messaging API, not a model. Message text and sender numbers are
// PII: they go to the booking agent (meta.product) and back, never to logs,
// and the sender number is only stored as a salted hash (session key).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { guardSalt } from "./salt";
import { getUnit, type Booking } from "./db/store";
import { egpLabel, refLabel, unitTitle, whenLabel, type UnitTitles } from "./booking-labels";

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0"}`;

// Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>.
export function verifyWhatsAppSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export interface IncomingAudio { id: string; mimeType: string; voice: boolean }
export interface IncomingMessage { id: string; from: string; type: string; text: string | null; name: string | null; audio: IncomingAudio | null }

// Messages from a webhook payload; delivery/read statuses are ignored.
export function incomingMessages(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (payload as { entry?: { changes?: { field?: string; value?: { messages?: unknown[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] } }[] }[] })?.entry ?? [];
  for (const e of entries) for (const c of e.changes ?? []) {
    if (c.field !== "messages") continue;
    for (const raw of c.value?.messages ?? []) {
      const m = raw as { id?: string; from?: string; type?: string; text?: { body?: string }; audio?: { id?: string; mime_type?: string; voice?: boolean } };
      if (!m.id || !m.from) continue;
      const name = c.value?.contacts?.find((x) => x.wa_id === m.from)?.profile?.name?.trim() || null;
      const audio = m.type === "audio" && m.audio?.id
        ? { id: m.audio.id, mimeType: (m.audio.mime_type ?? "audio/ogg").split(";")[0].trim(), voice: m.audio.voice === true } : null;
      out.push({ id: m.id, from: m.from, type: m.type ?? "unknown", text: m.type === "text" ? m.text?.body ?? null : null, name, audio });
    }
  }
  return out;
}

// Voice notes (6.8): fetch the media URL, then the bytes, both with the bearer token
// and an 8 s timeout each. Size is checked before the bytes are downloaded; the bytes are PII and never logged.
export const MAX_MEDIA_BYTES = 1024 * 1024; // ~1 min of Opus voice; keeps transcription cost and time small
export async function downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const metaRes = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(8_000) });
  if (!metaRes.ok) throw new Error(`WHATSAPP_MEDIA_${metaRes.status}`);
  const info = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number | string };
  const size = Number(info.file_size ?? 0);
  if (size > MAX_MEDIA_BYTES) throw new Error("WHATSAPP_MEDIA_TOO_LARGE");
  if (!info.url?.startsWith("https://")) throw new Error("WHATSAPP_MEDIA_NO_URL");
  const res = await fetch(info.url, { headers: auth, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`WHATSAPP_MEDIA_GET_${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new Error("WHATSAPP_MEDIA_TOO_LARGE");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("WHATSAPP_MEDIA_TOO_LARGE");
  const mime = info.mime_type ?? res.headers.get("content-type") ?? "audio/ogg";
  return { bytes, mimeType: mime.split(";")[0].trim() };
}

// Stable chat session per sender per Cairo day, so the per-session turn cap resets daily.
export function sessionKeyFor(waId: string, day: string): string {
  const h = createHash("sha256").update(`${guardSalt()}:wa:${waId}`).digest("hex").slice(0, 24);
  return `wa_${h}_${day.replaceAll("-", "")}`;
}
export const senderKey = (session: string) => `wa:${session.split("_")[1]}`;

// Free-form text reply; only valid inside the 24-hour customer-service window.
// One photo with a caption (unit cards after a search reply). Link must be public https.
export async function sendImage(to: string, link: string, caption: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "image", image: { link, caption: caption.slice(0, 1024) } }),
  });
  if (!res.ok) throw new Error(`WHATSAPP_SEND_${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function sendText(to: string, body: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: body.slice(0, 4096) } }),
  });
  if (!res.ok) throw new Error(`WHATSAPP_SEND_${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// After the signed XPay webhook (6.8): tell a WhatsApp renter the outcome, in AR + EN.
// Best effort: a send failure is logged and never fails the payment webhook.
type PaidBooking = { id: string; wa_id: string | null; status: string; unit_slug: string; date: string | null; total_egp: number; track?: Booking["track"] };
export async function notifyPaid(b: PaidBooking): Promise<void> {
  if (!b.wa_id || (b.status !== "confirmed" && b.status !== "paid_conflict")) return;
  const unit = await getUnit(b.unit_slug).catch(() => null);
  const text = paidNoticeText(b, unit, process.env.NEXT_PUBLIC_APP_URL ?? "");
  try { await sendText(b.wa_id, text); } catch (e) { console.error("[whatsapp] paid notice failed", refLabel(b.id), (e as Error).message); }
}
// Bilingual paid notice: unit title and weekday date label per language, ref in backticks.
export function paidNoticeText(b: PaidBooking, unit: UnitTitles | null, app: string, now = new Date()): string {
  const ref = `\`${refLabel(b.id)}\``;
  const slot = { track: b.track ?? "daily", date: b.date };
  const where = (l: "ar" | "en") => [unitTitle(unit, l), whenLabel(slot, l, now)].filter(Boolean).join(l === "ar" ? "، " : ", ");
  // The notice is bilingual and we don't store the renter's language: link both pages.
  const link = app ? `\n${app}/ar/booking/${b.id}\n${app}/en/booking/${b.id}` : "";
  return b.status === "confirmed"
    ? `✅ تم الدفع وحجزك اتأكد: ${where("ar")}. الإجمالي ${egpLabel(b.total_egp, "ar")}. رقم الحجز ${ref}\nPaid and confirmed: ${where("en")}. Total ${egpLabel(b.total_egp, "en")}. Booking ${ref}${link}`
    : `وصلنا الدفع، بس اليوم (${where("ar")}) اتحجز قبل ما الدفع يوصل. هنرجعلك ${egpLabel(b.total_egp, "ar")}. رقم الحجز ${ref}\nPayment received but the day (${where("en")}) was taken before it arrived; we will refund ${egpLabel(b.total_egp, "en")}. Booking ${ref}`;
}

// Optional "Get updates on WhatsApp" for website bookings (6.8, owner 2026-11-02):
// the renter sends us "Offisio <ref>-<code>" from a wa.me link; the signed code proves
// they opened that booking's page, and the sender's wa_id is then saved on the booking.
const linkCode = (bookingId: string) =>
  createHmac("sha256", `${process.env.WHATSAPP_APP_SECRET ?? ""}:wa-link`).update(bookingId).digest("hex").slice(0, 6);
export function waLinkUrl(bookingId: string): string | null {
  const num = (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  if (!num || !process.env.WHATSAPP_APP_SECRET) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(`Offisio ${bookingId.slice(0, 8)}-${linkCode(bookingId)}`)}`;
}
export function parseLinkMessage(text: string): { ref: string; code: string } | null {
  const m = text.trim().match(/^offisio\s+([0-9a-f]{8})-([0-9a-f]{6})$/i);
  return m ? { ref: m[1].toLowerCase(), code: m[2].toLowerCase() } : null;
}
export const linkCodeMatches = (bookingId: string, code: string) => {
  const a = Buffer.from(linkCode(bookingId)), b = Buffer.from(code);
  return a.length === b.length && timingSafeEqual(a, b);
};

// Renter phone from a WhatsApp id (verified by Meta): Egyptian mobiles in local form
// (201012345678 -> 01012345678), any other country as +<digits> (owner 2026-11-02).
export function phoneFromWaId(waId: string): string | null {
  const digits = waId.replace(/\D/g, "");
  const eg = digits.match(/^20(1[0125]\d{8})$/);
  return eg ? `0${eg[1]}` : /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}
