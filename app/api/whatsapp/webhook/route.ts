import { after } from "next/server";
import { chatTurn, sessionTurns } from "@/lib/agent/agent";
import { CAPS, firstSeen, limitKey } from "@/lib/guard";
import { bookingIdsByRef, getBooking, getUnit, setBookingWaId, todayCairo } from "@/lib/db/store";
import { egpLabel, refLabel, unitTitle, whenLabel } from "@/lib/booking-labels";
import { toTranscribableWav } from "@/lib/audio";
import { MetaError, meta } from "@/lib/meta/client";
import { handleOwnerMessage } from "@/lib/login";
import { downloadMedia, incomingMessages, linkCodeMatches, sendImage, parseLinkMessage, sendText, senderKey, sessionKeyFor, verifyWhatsAppSignature, type IncomingMessage } from "@/lib/whatsapp";

// WhatsApp booking channel (docs/plan/06 6.8): same agent, limits and spend
// breaker as web chat. Meta needs a fast 200, so the agent turn runs in after().
// Voice turns add media lookup + download (8 s each), ffmpeg (10 s) and
// transcription (20 s) before the agent turn; after() work counts toward this.
export const maxDuration = 120;

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
      try { await handle(m); } catch (e) { console.error("[whatsapp] turn failed", m.id, /^[A-Z0-9_]+/.exec((e as Error).message)?.[0] ?? (e as Error).name); }
    }
  });
  return Response.json({ ok: true });
}

// WhatsApp formatting: *bold* (single stars), no markdown headings.
const toWhatsApp = (s: string) => s.replace(/\*\*([^*\n]+)\*\*/g, "*$1*").replace(/^#{1,6}\s+/gm, "");
const isArabic = (s: string) => /[؀-ۿ]/.test(s);
const FIXED = {
  textOnly: { ar: "معلش، بفهم الرسائل المكتوبة والفويس نوت بس. اكتبلي أو ابعتلي فويس: محتاج مكتب فين ولإمتى؟", en: "Sorry, I can only read text messages and voice notes. Tell me where and when you need an office." },
  // Voice replies: we don't know the renter's language before transcribing, so AR then EN.
  voiceFailed: "معلش، مقدرتش أسمع الفويس كويس. ممكن تبعته تاني أو تكتبلي؟\nSorry, I couldn't make out that voice note. Could you resend it or type your message?",
  voiceTooLong: "الفويس طويل شوية، ممكن تبعت رسالة أقصر أو تكتبها؟\nThat voice note is a bit long. Could you send a shorter one or type it?",
  voiceLimited: "وصلنا للحد اليومي للمحادثة. جرب تاني بكرة أو احجز من الموقع.\nWe've reached today's chat limit. Try again tomorrow or book on the website.",
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
  const b = hit ? await getBooking(hit.id) : null;
  // Same rule as the booking page's button: only bookings still held or paid can be linked.
  if (!hit || !b || !["awaiting_payment", "confirmed"].includes(b.status)) return sendText(m.from, FIXED.linkBad);
  if (hit.wa_id && hit.wa_id !== m.from) return sendText(m.from, FIXED.linkTaken);
  await setBookingWaId(hit.id, m.from);
  // Bilingual message: one friendly line per language (no slug or ISO date; WhatsApp auto-links those).
  const u = b.status === "confirmed" ? await getUnit(b.unit_slug).catch(() => null) : null;
  const line = (l: "ar" | "en") => `\n${unitTitle(u, l)} · ${whenLabel(b, l)} · ${egpLabel(b.total_egp, l)} · ✅`;
  return sendText(m.from, FIXED.linked.replaceAll("{ref}", `\`${refLabel(b.id)}\``) + (b.status === "confirmed" ? line("ar") + line("en") : ""));
}

async function handle(m: IncomingMessage) {
  if (m.audio) return handleVoice(m, m.audio);
  const lang = m.text && isArabic(m.text) ? "ar" : m.text ? "en" : "ar";
  if (!m.text?.trim()) return sendText(m.from, FIXED.textOnly[lang]);
  const session = sessionKeyFor(m.from, todayCairo());
  // Owner sign-in ("Offisio login XXXX-XXXX", then YES; "Offisio logout") comes first.
  if (await handleOwnerMessage(m.from, m.text, senderKey(session))) return;
  const link = parseLinkMessage(m.text);
  if (link) {
    if (!(await limitKey("wa_link", senderKey(session))).ok) return sendText(m.from, FIXED.limited[lang]);
    return linkBooking(m, link.ref, link.code);
  }
  if (m.text.length > CAPS.chatChars) return sendText(m.from, FIXED.tooLong[lang]);
  if (!(await turnAllowed(session))) return sendText(m.from, FIXED.limited[lang]);
  return agentReply(m, session, m.text, lang, "");
}

// Same per-sender caps as text; checked before any paid call.
async function turnAllowed(session: string): Promise<boolean> {
  if ((await sessionTurns(session)) >= CAPS.sessionTurns) return false;
  return (await limitKey("chat", senderKey(session))).ok;
}

// Voice note (6.8): limits first (transcription costs money), then download,
// convert to WAV, transcribe on the PII path, and continue as a text turn.
// Audio, transcript and error text are never logged: only the message id and a code.
async function handleVoice(m: IncomingMessage, audio: NonNullable<IncomingMessage["audio"]>) {
  // Forwarded audio files (not recorded voice notes) are not supported.
  if (!audio.voice) return sendText(m.from, FIXED.textOnly.ar);
  const session = sessionKeyFor(m.from, todayCairo());
  if (!(await turnAllowed(session))) return sendText(m.from, FIXED.voiceLimited);
  let text = "";
  try {
    const media = await downloadMedia(audio.id);
    const wav = await toTranscribableWav(media.bytes, media.mimeType || audio.mimeType);
    text = (await meta.product.transcribe(wav)).text.trim();
  } catch (e) {
    const code = e instanceof MetaError ? `META_${e.status}` : /^[A-Z0-9_]+$/.test((e as Error).message) ? (e as Error).message : (e as Error).name;
    console.error("[whatsapp] voice failed", m.id, code);
    if (code === "WHATSAPP_MEDIA_TOO_LARGE") return sendText(m.from, FIXED.voiceTooLong);
  }
  if (!text) return sendText(m.from, FIXED.voiceFailed);
  if (text.length > CAPS.chatChars) return sendText(m.from, FIXED.voiceTooLong);
  const lang = isArabic(text) ? "ar" : "en";
  return agentReply(m, session, text, lang, `🎙️ "${text}"\n\n`);
}

async function agentReply(m: IncomingMessage, session: string, text: string, lang: "ar" | "en", prefix: string) {
  // The sender comes from the signed webhook, so the agent can use it as the renter's identity.
  const out = await chatTurn(session, text, "whatsapp", { waId: m.from, name: m.name });
  lang = out.lang; // the agent's reply language (stays Arabic on "ok"/an email) for the pay link and captions
  const payLink = out.booking_id && process.env.NEXT_PUBLIC_APP_URL
    ? `\n\n${FIXED.booking[lang]}\n${process.env.NEXT_PUBLIC_APP_URL}/${lang}/booking/${out.booking_id}` : "";
  await sendText(m.from, prefix + toWhatsApp(out.reply) + payLink);
  // Photo of each unit the reply names; best effort, a failed image never fails the turn.
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  for (const u of out.units) {
    const image = u.image.startsWith("http") ? u.image : app ? `${app}${u.image}` : "";
    if (!image.startsWith("https://")) continue;
    const price = u.daily_egp ? `${u.daily_egp} ${lang === "ar" ? "جنيه/اليوم" : "EGP/day"}` : `${u.rent_egp} ${lang === "ar" ? "جنيه/الشهر" : "EGP/month"}`;
    const caption = `*${lang === "ar" ? u.title_ar : u.title_en}*\n${u.district} · ${price}${u.synthetic ? (lang === "ar" ? "\n(صور مولّدة بالذكاء الاصطناعي)" : "\n(AI-generated photos)") : ""}${app ? `\n${app}/${lang}/units/${u.slug}` : ""}`;
    await sendImage(m.from, image, caption).catch((e) => console.error("[whatsapp] image failed", u.slug, (e as Error).message.match(/^WHATSAPP_SEND_\d+/)?.[0] ?? "WHATSAPP_SEND")); // fixed code only: the Graph body may echo the recipient
  }
}
