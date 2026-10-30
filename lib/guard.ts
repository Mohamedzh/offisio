// Usage limits + spend circuit breaker (docs/plan/06 6.3). Postgres counters,
// no new dependency. Limits protect the demo from abuse; normal judge use
// should never hit them. Every number can be overridden by env.
import { createHash } from "node:crypto";
import { pool } from "./db/pg";
import { todayCairo } from "./db/store";

export type LimitKind = "chat" | "upload" | "image_edit" | "booking" | "blob_token";
const DEFAULTS: Record<LimitKind, { ip: number; global: number }> = {
  chat: { ip: 40, global: 1000 },
  upload: { ip: 3, global: 20 },
  image_edit: { ip: 4, global: 40 },
  booking: { ip: 5, global: 100 },
  blob_token: { ip: 40, global: 400 }, // ~11 tokens per upload (frames + video)
};
export const CAPS = {
  chatChars: 800,
  sessionTurns: 20,
  videoSeconds: 45,
  videoBytes: 80 * 1024 * 1024,
  frameBytes: 1024 * 1024,
} as const;

const envNum = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(v) ? v : fallback;
};
function limitsFor(kind: LimitKind) {
  const k = kind.toUpperCase();
  return { ip: envNum(`LIMIT_${k}_IP`, DEFAULTS[kind].ip), global: envNum(`LIMIT_${k}_GLOBAL`, DEFAULTS[kind].global) };
}

// Hashed client IP: counters never store a raw address.
export function clientKey(req: Request): string {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return createHash("sha256").update(`${process.env.GUARD_SALT ?? "offisio-dev-salt"}:${ip}`).digest("hex").slice(0, 16);
}

async function bump(kind: string, key: string, by = 1): Promise<number> {
  const { rows } = await pool().query<{ n: string }>(
    `insert into usage_counters (day, kind, key, n) values ($1, $2, $3, $4)
     on conflict (day, kind, key) do update set n = usage_counters.n + excluded.n returning n`,
    [todayCairo(), kind, key, by]);
  return Number(rows[0].n);
}

export type Denied = { ok: false; code: "RATE_LIMITED" | "DEMO_QUOTA" };
export async function limit(kind: LimitKind, req: Request): Promise<{ ok: true } | Denied> {
  const lim = limitsFor(kind);
  if ((await bump(kind, `ip:${clientKey(req)}`)) > lim.ip) return { ok: false, code: "RATE_LIMITED" };
  if ((await bump(kind, "global")) > lim.global) return { ok: false, code: "DEMO_QUOTA" };
  return { ok: true };
}
export const deny = (code: string, status = 429) => Response.json({ error: code }, { status });

// --- Spend: token usage x owner-supplied prices (USD per 1M tokens) ---------
type Usage = { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
const family = (model: string) => (model.startsWith("muse-image") ? "IMAGE" : model.includes("contributor") ? "SPARK_CONTRIBUTOR" : "SPARK");
const price = (model: string, dir: "IN" | "OUT") => Number(process.env[`META_PRICE_${family(model)}_${dir}_PER_M`]);

export async function recordUsage(model: string, usage: Usage | undefined): Promise<void> {
  if (!usage) return;
  const inTok = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const outTok = usage.completion_tokens ?? usage.output_tokens ?? 0;
  await bump("tokens", model, inTok + outTok);
  const pin = price(model, "IN"); const pout = price(model, "OUT");
  // tokens x (USD per 1M tokens) = micro-USD
  if (Number.isFinite(pin) && Number.isFinite(pout)) await bump("spend_micro_usd", "global", Math.round(inTok * pin + outTok * pout));
}

// True when today's estimated spend (or, without prices, total tokens) is over
// the ceiling. Blocks uploads and staging only; browsing, booking, payment and
// cached units keep working. Chat has its own caps.
export async function spendBlocked(): Promise<boolean> {
  const day = todayCairo();
  const pricesSet = ["SPARK", "IMAGE"].every((f) => Number.isFinite(Number(process.env[`META_PRICE_${f}_IN_PER_M`])));
  if (pricesSet) {
    const { rows } = await pool().query<{ n: string }>("select coalesce(sum(n),0)::text n from usage_counters where day = $1 and kind = 'spend_micro_usd'", [day]);
    const over = Number(rows[0].n) / 1e6 >= envNum("DEMO_DAILY_SPEND_USD", 15);
    if (over) console.warn("[guard] DEMO_QUOTA: daily spend ceiling reached");
    return over;
  }
  const { rows } = await pool().query<{ n: string }>("select coalesce(sum(n),0)::text n from usage_counters where day = $1 and kind = 'tokens'", [day]);
  const over = Number(rows[0].n) >= envNum("DEMO_DAILY_TOKEN_CAP", 6_000_000);
  if (over) console.warn("[guard] DEMO_QUOTA: daily token cap reached (prices not set)");
  return over;
}
