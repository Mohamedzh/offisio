// Owner session (WhatsApp sign-in). The session cookie holds an HMAC-SHA256
// signed token: base64url(JSON {sub: wa_id, exp, ep}) + "." + base64url(sig);
// ep is the owner's sign-out epoch at sign-in ("Offisio logout" bumps it).
// wa_id is PII: never logged, never sent to the browser (only a masked form).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ownerEpoch, unitOwnerWaId } from "./db/auth";
import { isDemoUnit } from "./demo-units";

export const OWNER_COOKIE = "offisio_owner";
export const LOGIN_COOKIE = "offisio_login";
export const OWNER_MAX_AGE = 60 * 60 * 24; // 24 h
export const LOGIN_MAX_AGE = 60 * 10; // 10 min
export const GUEST_COOKIE = "offisio_guest";
export const GUEST_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// The dev fallback is public (the repo is), so production refuses to run without one.
function sessionSecret(): string {
  const s = process.env.OWNER_SESSION_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error("OWNER_SESSION_SECRET_MISSING");
  return "offisio-dev-owner-session";
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge,
});

const sign = (body: string) => createHmac("sha256", sessionSecret()).update(body).digest();
// A separate key per token purpose (e.g. "wa-link"), derived from the session secret, so
// such tokens can never verify as an owner or guest token (or the other way round).
export const purposeKey = (purpose: string): Buffer => createHmac("sha256", sessionSecret()).update(`offisio-purpose:${purpose}`).digest();

export function signOwnerToken(waId: string, epoch: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ sub: waId, exp: Math.floor(now / 1000) + OWNER_MAX_AGE, ep: epoch }), "utf8").toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

export function verifyOwnerToken(token: string | undefined, now = Date.now()): { waId: string; epoch: number } | null {
  if (!token || token.length > 512) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const got = Buffer.from(sig, "base64url"); const expected = sign(body);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown; ep?: unknown; typ?: unknown };
    if ("typ" in p) return null; // typed tokens (guest) are never owner sessions
    if (typeof p.sub !== "string" || !/^\d{6,20}$/.test(p.sub) || typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
    if (typeof p.ep !== "number" || !Number.isInteger(p.ep)) return null;
    return { waId: p.sub, epoch: p.ep };
  } catch {
    return null;
  }
}

// A valid signature is not enough: the token's epoch must still be current
// (one indexed lookup; no row = epoch 0).
export async function ownerFromToken(token: string | undefined): Promise<{ waId: string } | null> {
  const v = verifyOwnerToken(token);
  if (!v || v.epoch !== (await ownerEpoch(v.waId))) return null;
  return { waId: v.waId };
}

// Server-only: the signed-in owner for this request, or null.
export async function currentOwner(): Promise<{ waId: string } | null> {
  return ownerFromToken((await cookies()).get(OWNER_COOKIE)?.value);
}

// "+20 10x xxx x678": Egyptian mobiles keep the country and network prefix,
// every other number shows only its last 3 digits.
export function maskWaId(waId: string): string {
  const d = waId.replace(/\D/g, "");
  if (/^201\d{9}$/.test(d)) return `+20 ${d.slice(2, 4)}x xxx x${d.slice(-3)}`;
  return `+${"x".repeat(Math.max(0, d.length - 3))}${d.slice(-3)}`;
}

// Guest uploader (no sign-in): a random id, not PII, signed like the owner token:
// base64url(JSON {gid, exp, typ: "guest"}) + "." + base64url(sig). The units it
// uploads are private drafts (units.guest_owner) until published with WhatsApp.
const GUEST_ID_RE = /^[A-Za-z0-9_-]{22,64}$/;
export function signGuestToken(guestId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ gid: guestId, exp: Math.floor(now / 1000) + GUEST_MAX_AGE, typ: "guest" }), "utf8").toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}
export function verifyGuestToken(token: string | undefined, now = Date.now()): string | null {
  if (!token || token.length > 512) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const got = Buffer.from(sig, "base64url"); const expected = sign(body);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { gid?: unknown; exp?: unknown; typ?: unknown };
    if (p.typ !== "guest" || typeof p.gid !== "string" || !GUEST_ID_RE.test(p.gid) || typeof p.exp !== "number" || p.exp * 1000 <= now) return null;
    return p.gid;
  } catch {
    return null;
  }
}
// Server-only: this browser's guest id, or null.
export async function currentGuest(): Promise<string | null> {
  return verifyGuestToken((await cookies()).get(GUEST_COOKIE)?.value);
}
// Route handlers only (sets a cookie): the existing guest id, else a new one.
export async function issueGuest(): Promise<string> {
  const existing = await currentGuest();
  if (existing) return existing;
  const id = randomBytes(18).toString("base64url");
  (await cookies()).set(GUEST_COOKIE, signGuestToken(id), cookieOptions(GUEST_MAX_AGE));
  return id;
}

const same = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Real writes (spec edits, renders, pipeline retries) only for the unit's own
// owner: the signed-in wa_id matches owner_wa_id, or (for a draft) this browser's
// guest id matches guest_owner. Demo units are always preview, even if an owner is ever set on one.
export type EditMode = "owner" | "preview";
export interface UnitOwnership { owner_wa_id: string | null; guest_owner: string | null }
export interface Viewer { waId?: string | null; guestId?: string | null }
export function editModeFor(slug: string, unit: UnitOwnership | null | undefined, viewer: Viewer): EditMode {
  if (isDemoUnit(slug) || !unit) return "preview";
  return same(unit.owner_wa_id, viewer.waId) || same(unit.guest_owner, viewer.guestId) ? "owner" : "preview";
}
// Pass `owner` when the caller already looked it up (saves a second epoch query).
export async function editMode(slug: string, owner?: { waId: string } | null): Promise<EditMode> {
  if (isDemoUnit(slug)) return "preview";
  const [unit, o, guestId] = await Promise.all([unitOwnerWaId(slug), owner === undefined ? currentOwner() : owner, currentGuest()]);
  return editModeFor(slug, unit, { waId: o?.waId, guestId });
}

// Post-sign-in return path (?next=): same-origin, path only, under a locale prefix.
// Anything else (//host, schemes, backslashes, queries) is dropped.
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  return /^\/(ar|en)(\/[A-Za-z0-9_-]+)*$/.test(raw) ? raw : null;
}

// Local mock publish: only when WhatsApp sign-in cannot work (no token) and never on Vercel.
export const publishMockAllowed = (): boolean => !process.env.WHATSAPP_TOKEN && !process.env.VERCEL;

// Publish action for a draft's own uploader (null for everyone else). "unavailable":
// on Vercel without WhatsApp configured, so sign-in (and publishing) cannot work.
export type PublishMode = "signed_in" | "mock" | "sign_in" | "unavailable";
export function draftPublishMode(slug: string, mode: EditMode, owner: { waId: string } | null): PublishMode | null {
  if (mode !== "owner" || isDemoUnit(slug)) return null;
  if (owner) return "signed_in";
  if (publishMockAllowed()) return "mock";
  return process.env.WHATSAPP_TOKEN ? "sign_in" : "unavailable";
}
