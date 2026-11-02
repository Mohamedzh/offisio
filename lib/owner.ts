// Owner session (WhatsApp sign-in). The session cookie holds an HMAC-SHA256
// signed token: base64url(JSON {sub: wa_id, exp, ep}) + "." + base64url(sig);
// ep is the owner's sign-out epoch at sign-in ("Offisio logout" bumps it).
// wa_id is PII: never logged, never sent to the browser (only a masked form).
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ownerEpoch, unitOwnerWaId } from "./db/auth";
import { isDemoUnit } from "./demo-units";

export const OWNER_COOKIE = "offisio_owner";
export const LOGIN_COOKIE = "offisio_login";
export const OWNER_MAX_AGE = 60 * 60 * 24; // 24 h
export const LOGIN_MAX_AGE = 60 * 10; // 10 min

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
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown; ep?: unknown };
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

// Real writes (spec edits, renders, pipeline retries) only for the unit's own
// owner. Demo units are always preview, even if an owner is ever set on one.
export type EditMode = "owner" | "preview";
export function editModeFor(slug: string, unitOwner: string | null | undefined, viewer: string | null | undefined): EditMode {
  if (isDemoUnit(slug) || !unitOwner || !viewer) return "preview";
  const a = Buffer.from(unitOwner), b = Buffer.from(viewer);
  return a.length === b.length && timingSafeEqual(a, b) ? "owner" : "preview";
}
export async function editMode(slug: string): Promise<EditMode> {
  if (isDemoUnit(slug)) return "preview";
  const [unit, owner] = await Promise.all([unitOwnerWaId(slug), currentOwner()]);
  return editModeFor(slug, unit?.owner_wa_id, owner?.waId);
}
