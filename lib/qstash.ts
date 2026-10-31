// QStash over plain HTTP (no SDK): publish a JSON message to one of our routes,
// and verify the Upstash-Signature JWT on delivery (HS256, current key then next).
// Docs: upstash.com/docs/qstash/howto/signature
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

// Off locally: QStash cannot reach localhost, so lib/pipeline/jobs.ts runs steps in-process.
export function qstashEnabled(): boolean {
  return Boolean(process.env.QSTASH_TOKEN) && /^https:\/\//.test(appUrl()) && !/localhost|127\.0\.0\.1/.test(appUrl());
}

export const routeUrl = (path: string) => `${appUrl()}${path}`;

export async function publish(path: string, body: unknown, retries = 2): Promise<void> {
  const base = (process.env.QSTASH_URL ?? "https://qstash.upstash.io").replace(/\/+$/, "");
  const r = await fetch(`${base}/v2/publish/${routeUrl(path)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}`, "Content-Type": "application/json", "Upstash-Retries": String(retries) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`qstash publish ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const b64url = (b: Buffer) => b.toString("base64url");
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function verifyWith(key: string, jwt: string, body: string, url: string): boolean {
  const [header, payload, sig] = jwt.split(".");
  if (!key || !header || !payload || !sig) return false;
  if (!sameText(sig.replace(/=+$/, ""), b64url(createHmac("sha256", key).update(`${header}.${payload}`).digest()))) return false;
  let p: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
  try { p = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  if (p.iss !== "Upstash" || p.sub?.replace(/\/+$/, "") !== url.replace(/\/+$/, "")) return false;
  if (typeof p.exp !== "number" || now > p.exp || (typeof p.nbf === "number" && now < p.nbf)) return false;
  return (p.body ?? "").replace(/=+$/, "") === b64url(createHash("sha256").update(body).digest());
}

export function verifySignature(jwt: string | null, body: string, url: string): boolean {
  if (!jwt) return false;
  return verifyWith(process.env.QSTASH_CURRENT_SIGNING_KEY ?? "", jwt, body, url)
    || verifyWith(process.env.QSTASH_NEXT_SIGNING_KEY ?? "", jwt, body, url);
}
