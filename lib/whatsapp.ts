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

export interface IncomingMessage { id: string; from: string; type: string; text: string | null }

// Messages from a webhook payload; delivery/read statuses are ignored.
export function incomingMessages(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (payload as { entry?: { changes?: { field?: string; value?: { messages?: unknown[] } }[] }[] })?.entry ?? [];
  for (const e of entries) for (const c of e.changes ?? []) {
    if (c.field !== "messages") continue;
    for (const raw of c.value?.messages ?? []) {
      const m = raw as { id?: string; from?: string; type?: string; text?: { body?: string } };
      if (!m.id || !m.from) continue;
      out.push({ id: m.id, from: m.from, type: m.type ?? "unknown", text: m.type === "text" ? m.text?.body ?? null : null });
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
export async function sendText(to: string, body: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: body.slice(0, 4096) } }),
  });
  if (!res.ok) throw new Error(`WHATSAPP_SEND_${res.status}: ${(await res.text()).slice(0, 300)}`);
}
