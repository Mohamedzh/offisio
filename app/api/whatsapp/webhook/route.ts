import { after } from "next/server";
import { chatTurn, sessionTurns } from "@/lib/agent/agent";
import { CAPS, firstSeen, limitKey } from "@/lib/guard";
import { bookingIdsByRef, getBooking, setBookingWaId, todayCairo } from "@/lib/db/store";
import { incomingMessages, linkCodeMatches, parseLinkMessage, sendText, senderKey, sessionKeyFor, verifyWhatsAppSignature, type IncomingMessage } from "@/lib/whatsapp";

// WhatsApp booking channel (docs/plan/06 6.8): same agent, limits and spend
// breaker as web chat. Meta needs a fast 200, so the agent turn runs in after().

// Webhook verification handshake (Meta > WhatsApp > Configuration).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token)
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyWhatsAppSignature(rawBody, req.headers.get("x-hub-signature-256")))
    return Response.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return Response.json({ error: "BAD_JSON" }, { status: 400 }); }
  const messages = incomingMessages(payload);
  after(async () => {
    for (const m of messages) {
      // Meta retries deliveries: handle each message id once.
      if (!(await firstSeen("wa_msg", m.id))) continue;
      try { await handle(m); } catch (e) { console.error("[whatsapp] turn failed", m.id, (e as Error).message); }
    }
  });
  return Response.json({ ok: true });
}

const isArabic = (s: string) => /[؀-ۿ]/.test(s);
const FIXED = {
  textOnly: { ar: "معلش، بقرا الرسائل المكتوبة بس دلوقتي. اكتبلي محتاج مكتب فين ولإمتى.", en: "Sorry, I can only read text messages for now. Tell me where and when you need an office." },
  tooLong: { ar: "الرسالة طويلة شوية، ممكن تختصرها؟", en: "That message is a bit long. Could you shorten it?" },
  limited: { ar: "وصلنا للحد اليومي للمحادثة. جرب تاني بكرة أو احجز من الموقع.", en: "We've reached today's chat limit. Try again tomorrow or book on the website." },
  booking: { ar: "كمّل الدفع من هنا (الحجز محجوز ٣٠ دقيقة):", en: "Complete payment here (held for 30 minutes):" },
  linked: "✅ تمام، هنبعتلك هنا تحديثات حجزك ({ref}). وتقدر تسألني عن حجوزاتك في أي وقت.\n✅ Done: we'll send updates on booking {ref} here, and you can ask me about your bookings any time.",
  linkTaken: "الحجز ده متربط برقم واتساب تاني.\nThis booking is already linked to another WhatsApp number.",
  linkBad: "الكود ده مش صحيح. افتح صفحة الحجز ودوس على زرار واتساب تاني.\nThat code isn't valid. Open the booking page and tap the WhatsApp button again.",
};

// "Offisio <ref>-<code>" from the booking page's optional WhatsApp button.
async function linkBooking(m: IncomingMessage, ref: string, code: string) {
  const hit = (await bookingIdsByRef(ref)).find((b) => linkCodeMatches(b.id, code));
  if (!hit) return sendText(m.from, FIXED.linkBad);
  if (hit.wa_id && hit.wa_id !== m.from) return sendText(m.from, FIXED.linkTaken);
  await setBookingWaId(hit.id, m.from);
  const b = await getBooking(hit.id);
  return sendText(m.from, FIXED.linked.replaceAll("{ref}", ref) + (b?.status === "confirmed" ? `\n${b.unit_slug} ${b.date ?? ""} · ${b.total_egp} EGP · ✅` : ""));
}

async function handle(m: IncomingMessage) {
  const lang = m.text && isArabic(m.text) ? "ar" : m.text ? "en" : "ar";
  if (!m.text?.trim()) return sendText(m.from, FIXED.textOnly[lang]);
  const link = parseLinkMessage(m.text);
  if (link) return linkBooking(m, link.ref, link.code);
  if (m.text.length > CAPS.chatChars) return sendText(m.from, FIXED.tooLong[lang]);
  const session = sessionKeyFor(m.from, todayCairo());
  if ((await sessionTurns(session)) >= CAPS.sessionTurns) return sendText(m.from, FIXED.limited[lang]);
  if (!(await limitKey("chat", senderKey(session))).ok) return sendText(m.from, FIXED.limited[lang]);
  // The sender comes from the signed webhook, so the agent can use it as the renter's identity.
  const out = await chatTurn(session, m.text, "whatsapp", { waId: m.from, name: m.name });
  const payLink = out.booking_id && process.env.NEXT_PUBLIC_APP_URL
    ? `\n\n${FIXED.booking[lang]}\n${process.env.NEXT_PUBLIC_APP_URL}/${lang}/booking/${out.booking_id}` : "";
  await sendText(m.from, out.reply + payLink);
}
