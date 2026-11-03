// Single-use "your listing is ready" link (plan/08 8.1 step 5), sent on WhatsApp to the
// owner who sent the video. Token: base64url(JSON {typ, slug, gid, lang, exp, jti})
// + "." + base64url(HMAC-SHA256), keyed by purposeKey("wa-link") so it can never verify
// as an owner or guest token. 30 min expiry; single use is enforced by the route with
// firstSeen("wa_link_token", jti). No PII in the token (it lands in browser history and
// request logs): the route looks up the draft by slug and takes the owner's wa_id from it.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { purposeKey } from "./owner";

export const WA_LINK_TTL_S = 30 * 60;
export interface WaLinkClaims { slug: string; gid: string; lang: "ar" | "en"; exp: number; jti: string }

const sign = (body: string) => createHmac("sha256", purposeKey("wa-link")).update(body).digest();
const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/, GID_RE = /^[A-Za-z0-9_-]{22,64}$/, JTI_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function signWaLink(c: { slug: string; gid: string; lang: "ar" | "en" }, now = Date.now()): string {
  const claims: WaLinkClaims & { typ: "wa_link" } = { typ: "wa_link", slug: c.slug, gid: c.gid, lang: c.lang, exp: Math.floor(now / 1000) + WA_LINK_TTL_S, jti: randomBytes(16).toString("base64url") };
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

// Signature, shape and expiry only (single use and the draft check are the route's).
export function verifyWaLink(token: string | null | undefined, now = Date.now()): WaLinkClaims | null {
  if (!token || token.length > 1024) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const got = Buffer.from(sig, "base64url"); const expected = sign(body);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (p.typ !== "wa_link" || typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
    if (typeof p.slug !== "string" || !SLUG_RE.test(p.slug) || typeof p.gid !== "string" || !GID_RE.test(p.gid)) return null;
    if (typeof p.jti !== "string" || !JTI_RE.test(p.jti)) return null;
    if (p.lang !== "ar" && p.lang !== "en") return null;
    return { slug: p.slug, gid: p.gid, lang: p.lang, exp: p.exp, jti: p.jti };
  } catch {
    return null;
  }
}

/** Full link for the WhatsApp message, or null without NEXT_PUBLIC_APP_URL. */
export function listingLinkUrl(c: { slug: string; gid: string; lang: "ar" | "en" }, now = Date.now()): string | null {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return app ? `${app}/api/auth/wa-link?t=${signWaLink(c, now)}` : null;
}
