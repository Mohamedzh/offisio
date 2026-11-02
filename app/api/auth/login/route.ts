// Start "Sign in with WhatsApp": issue a one-time code bound to this browser
// (httpOnly nonce cookie, 10 min) and return the wa.me link that pre-fills it.
import { cookies } from "next/headers";
import { insertLoginCode } from "@/lib/db/auth";
import { deny, limit } from "@/lib/guard";
import { displayCode, loginLinkUrl, newBrowserNonce, newLoginCode } from "@/lib/login";
import { cookieOptions, LOGIN_COOKIE, LOGIN_MAX_AGE } from "@/lib/owner";

export async function POST(req: Request) {
  // JSON only: a cross-site form post cannot set this content type.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
  // Per-IP only: a global cap would let a few IPs lock every owner out.
  const allowed = await limit("login", req, { global: false });
  if (!allowed.ok) return deny(allowed.code);
  const code = newLoginCode();
  const url = loginLinkUrl(code);
  if (!url) return Response.json({ error: "WHATSAPP_NOT_CONFIGURED" }, { status: 503 });
  const nonce = newBrowserNonce();
  await insertLoginCode(code, nonce);
  (await cookies()).set(LOGIN_COOKIE, nonce, cookieOptions(LOGIN_MAX_AGE));
  return Response.json({ url, code: displayCode(code) });
}
