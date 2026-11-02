// "Sign in with WhatsApp" (owner-approved 2026-11-02, replaces Clerk). The site
// issues a one-time code; the owner sends "Offisio login XXXX-XXXX" to our
// WhatsApp number; the signed webhook marks it pending for that sender, who
// must then reply YES within 2 minutes. "Offisio logout" signs out everywhere.
// Codes, wa_id and phone numbers are never logged.
import { randomBytes } from "node:crypto";
import { bumpOwnerEpoch, clearLoginPending, confirmPendingYes, hasPendingYes, markLoginPending } from "./db/auth";
import { limitKey } from "./guard";
import { sendText } from "./whatsapp";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// 8 Crockford base32 chars (40 random bits), stored without the dash.
export function newLoginCode(): string {
  const bytes = randomBytes(5);
  let n = 0; // 40 bits: exact in a double
  for (const b of bytes) n = n * 256 + b;
  let out = "";
  for (let i = 0; i < 8; i++) { out = CROCKFORD[n % 32] + out; n = Math.floor(n / 32); }
  return out;
}
export const newBrowserNonce = () => randomBytes(24).toString("base64url");
export const displayCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export function loginLinkUrl(code: string): string | null {
  const num = (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(`Offisio login ${displayCode(code)}`)}` : null;
}

// Normalized code (no dash) when the text is a login message, else null.
// Crockford decoding is forgiving: O -> 0, I/L -> 1.
export function parseLoginMessage(text: string): string | null {
  const m = text.trim().match(/^offisio\s+login\s+([A-Z0-9]{4}-?[A-Z0-9]{4})$/i);
  if (!m) return null;
  // A code with a non-Crockford letter (U) simply matches no row: the sender gets the "expired" reply.
  return m[1].toUpperCase().replace("-", "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

// YES in English or Egyptian Arabic, trimmed, trailing punctuation ignored.
const YES = new Set(["yes", "y", "نعم", "أيوه", "ايوه", "أيوة", "ايوة", "ايوا", "اه", "آه"]);
export const isYes = (text: string) => YES.has(text.trim().replace(/[\s.!?,؟،]+$/u, "").toLowerCase());
export const isLogout = (text: string) =>
  /^offisio\s+(log\s*out|sign\s*out)[\s.!]*$/i.test(text.trim()) || text.trim() === "تسجيل خروج";

const REPLY = {
  askYes: "في حد بيسجّل دخول على Offisio من جهاز. رد بـ «نعم» خلال دقيقتين بس لو ده إنت دلوقتي. أوعى ترد بـ «نعم» لو حد بعتلك الكود ده.\nSomeone is signing in to Offisio on another device. Reply YES within 2 minutes only if that's you, right now. Never reply YES if someone sent you this code.",
  ok: "✅ تم تسجيل الدخول. عشان تخرج من كل الأجهزة، ابعت: Offisio logout\n✅ Signed in. To sign out everywhere, send: Offisio logout",
  loggedOut: "تم تسجيل خروجك من Offisio على كل الأجهزة.\nSigned out of Offisio on all devices.",
  bad: "الكود ده انتهى أو مش صحيح. ارجع للموقع ودوس على زرار «سجّل دخول بواتساب» تاني.\nThat code has expired or isn't valid. Go back to the website and tap \"Sign in with WhatsApp\" again.",
  limited: "محاولات كتير النهارده. جرب تاني بكرة.\nToo many sign-in attempts today. Please try again tomorrow.",
};

// Webhook: owner sign-in messages. Returns false when the text is not one, so the
// caller continues (a YES with no pending sign-in for this sender goes to the agent).
// `sender` is the hashed sender key; limits are per sender only (no global lockout).
export async function handleOwnerMessage(from: string, text: string, sender: string): Promise<boolean> {
  const code = parseLoginMessage(text);
  const logout = !code && isLogout(text);
  const yes = !code && !logout && isYes(text) && (await hasPendingYes(from));
  if (!code && !logout && !yes) return false;
  // Logout has its own bucket: login attempts can never block signing out.
  const allowed = (await limitKey(logout ? "wa_logout" : "wa_login", sender, { global: false })).ok;
  if (!allowed) { await sendReply(from, REPLY.limited); return true; }
  if (logout) { await bumpOwnerEpoch(from); await sendReply(from, REPLY.loggedOut); return true; }
  if (yes || !code) { await sendReply(from, (await confirmPendingYes(from)) ? REPLY.ok : REPLY.bad); return true; }
  const pending = await markLoginPending(code, from);
  // No warning delivered = no YES allowed for this code.
  if (!(await sendReply(from, pending ? REPLY.askYes : REPLY.bad)) && pending) await clearLoginPending(code);
  return true;
}

async function sendReply(from: string, reply: string): Promise<boolean> {
  try {
    await sendText(from, reply);
    return true;
  } catch (e) {
    // Only a fixed code: the error text may echo the recipient.
    console.error("[login] reply failed", (e as Error).message.match(/^WHATSAPP_SEND_\d+/)?.[0] ?? "WHATSAPP_SEND");
    return false;
  }
}
