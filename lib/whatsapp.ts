// WhatsApp Cloud API channel (docs/plan/06 6.8). Transport only: the Graph API
// is Meta's messaging API, not a model. Message text and sender numbers are
// PII: they go to the booking agent (meta.product) and back, never to logs,
// and the sender number is only stored as a salted hash (session key).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0"}`;

// Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>.
export function verifyWhatsAppSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export interface IncomingMessage { id: string; from: string; type: string; text: string | null; name: string | null }

// Messages from a webhook payload; delivery/read statuses are ignored.
export function incomingMessages(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (payload as { entry?: { changes?: { field?: string; value?: { messages?: unknown[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] } }[] }[] })?.entry ?? [];
  for (const e of entries) for (const c of e.changes ?? []) {
    if (c.field !== "messages") continue;
    for (const raw of c.value?.messages ?? []) {
      const m = raw as { id?: string; from?: string; type?: string; text?: { body?: string } };
      if (!m.id || !m.from) continue;
      const name = c.value?.contacts?.find((x) => x.wa_id === m.from)?.profile?.name?.trim() || null;
      out.push({ id: m.id, from: m.from, type: m.type ?? "unknown", text: m.type === "text" ? m.text?.body ?? null : null, name });
    }
  }
  return out;
}

// Stable chat session per sender per Cairo day, so the per-session turn cap resets daily.
export function sessionKeyFor(waId: string, day: string): string {
  const h = createHash("sha256").update(`${process.env.GUARD_SALT ?? "offisio-dev-salt"}:wa:${waId}`).digest("hex").slice(0, 24);
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
export async function notifyPaid(b: { id: string; wa_id: string | null; status: string; unit_slug: string; date: string | null; total_egp: number }): Promise<void> {
  if (!b.wa_id || (b.status !== "confirmed" && b.status !== "paid_conflict")) return;
  const ref = b.id.slice(0, 8); const when = b.date ?? "";
  const link = process.env.NEXT_PUBLIC_APP_URL ? `\n${process.env.NEXT_PUBLIC_APP_URL}/ar/booking/${b.id}` : "";
  const text = b.status === "confirmed"
    ? `✅ تم الدفع وحجزك اتأكد. رقم الحجز ${ref}، ${b.unit_slug} ${when}، الإجمالي ${b.total_egp} جنيه.\nPaid and confirmed: booking ${ref}, ${b.unit_slug} ${when}, total EGP ${b.total_egp}.${link}`
    : `وصلنا الدفع، بس اليوم اتحجز قبل ما الدفع يوصل. هنرجعلك المبلغ (${b.total_egp} جنيه)، رقم الحجز ${ref}.\nPayment received but the day was taken before it arrived; we will refund EGP ${b.total_egp} (booking ${ref}).`;
  try { await sendText(b.wa_id, text); } catch (e) { console.error("[whatsapp] paid notice failed", ref, (e as Error).message); }
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
