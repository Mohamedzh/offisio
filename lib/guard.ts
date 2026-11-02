// Usage limits + spend circuit breaker (docs/plan/06 6.3). Postgres counters,
// no new dependency. Limits protect the demo from abuse; normal judge use
// should never hit them. Every number can be overridden by env.
import { createHash } from "node:crypto";
import { pool } from "./db/pg";
import { todayCairo } from "./db/store";
import { guardSalt } from "./salt";

export type LimitKind = "chat" | "upload" | "image_edit" | "booking" | "blob_token" | "wa_link" | "spec_edit" | "login" | "wa_login" | "wa_logout";
const DEFAULTS: Record<LimitKind, { ip: number; global: number }> = {
  chat: { ip: 40, global: 1000 },
  upload: { ip: 3, global: 20 },
  image_edit: { ip: 4, global: 40 },
  booking: { ip: 5, global: 100 },
  blob_token: { ip: 100, global: 1000 }, // up to 31 tokens per upload (frames + video)
  wa_link: { ip: 5, global: 200 }, // "Offisio <ref>-<code>" attempts per WhatsApp sender
  spec_edit: { ip: 30, global: 500 }, // owner spec saves (demo units: preview only)
  login: { ip: 10, global: 300 }, // "Sign in with WhatsApp" codes per browser IP (checked per-IP only)
  wa_login: { ip: 10, global: 300 }, // login code and YES messages per WhatsApp sender (per-sender only)
  wa_logout: { ip: 20, global: 300 }, // "Offisio logout" per sender (per-sender only; own bucket, never blocked by login attempts)
};
export const CAPS = {
  chatChars: 800,
  sessionTurns: 20,
  videoSeconds: 45,
  videoBytes: 80 * 1024 * 1024,
  frameBytes: 1024 * 1024,
  framesMin: 3,
  framesMax: 30,
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
  return createHash("sha256").update(`${guardSalt()}:${ip}`).digest("hex").slice(0, 16);
}

async function bump(kind: string, key: string, by = 1): Promise<number> {
  const { rows } = await pool().query<{ n: string }>(
    `insert into usage_counters (day, kind, key, n) values ($1, $2, $3, $4)
     on conflict (day, kind, key) do update set n = usage_counters.n + excluded.n returning n`,
    [todayCairo(), kind, key, by]);
  return Number(rows[0].n);
}

export type Denied = { ok: false; code: "RATE_LIMITED" | "DEMO_QUOTA" };
// opts.global false: per-caller cap only (e.g. demo previews that write nothing).
export async function limit(kind: LimitKind, req: Request, opts?: { global?: boolean }): Promise<{ ok: true } | Denied> {
  return limitKey(kind, `ip:${clientKey(req)}`, opts);
}
// Same caps keyed by any hashed caller id (e.g. a WhatsApp sender); the "ip" cap applies per key.
export async function limitKey(kind: LimitKind, key: string, opts?: { global?: boolean }): Promise<{ ok: true } | Denied> {
  const lim = limitsFor(kind);
  if ((await bump(kind, key)) > lim.ip) return { ok: false, code: "RATE_LIMITED" };
  if (opts?.global !== false && (await bump(kind, "global")) > lim.global) return { ok: false, code: "DEMO_QUOTA" };
  return { ok: true };
}
// True only the first time (kind, key) is ever seen: dedupes webhook retries,
// including a redelivery that lands after Cairo midnight.
export async function firstSeen(kind: string, key: string): Promise<boolean> {
  const seen = await pool().query("select 1 from usage_counters where kind = $1 and key = $2 and day < $3 limit 1", [kind, key, todayCairo()]);
  if (seen.rowCount) return false;
  return (await bump(kind, key)) === 1;
}
export const deny = (code: string, status = 429) => Response.json({ error: code }, { status });

// --- Spend: Meta list prices (developer console, captured 2026-10-30) ------
// Chat: USD per 1M tokens (cached input billed separately). Image: USD per
// output image. Env META_PRICE_<FAMILY>_<IN|CACHED|OUT>_PER_M and
// META_PRICE_IMAGE_PER_IMAGE override the defaults.
type Usage = { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
const CHAT_PRICES: Record<string, { IN: number; CACHED: number; OUT: number }> = {
  SPARK: { IN: 1.25, CACHED: 0.15, OUT: 4.25 },
  SPARK_CONTRIBUTOR: { IN: 0.10, CACHED: 0.002, OUT: 0.20 },
};
const IMAGE_PER_IMAGE = 0.01;
const ASR_PER_HOUR = 0.18; // muse-voice-transcribe-1.0: per audio hour, floored to whole seconds
const family = (model: string) => (model.includes("contributor") ? "SPARK_CONTRIBUTOR" : "SPARK");
const chatPrice = (model: string, dir: "IN" | "CACHED" | "OUT") =>
  envNum(`META_PRICE_${family(model)}_${dir}_PER_M`, CHAT_PRICES[family(model)][dir]);

// Estimated cost in micro-USD of one model response (images = outputs returned,
// audioMs = audioDurationMs of a successful transcription).
export function costMicroUsd(model: string, usage: Usage | undefined, images = 0, audioMs = 0): number {
  if (model.startsWith("meta-models/")) return 0; // own Modal deployment: Modal credits, not Meta spend
  if (model.startsWith("muse-voice")) return Math.round(Math.floor(audioMs / 1000) * envNum("META_PRICE_ASR_PER_HOUR", ASR_PER_HOUR) / 3600 * 1e6);
  if (model.startsWith("muse-image")) return Math.round(images * envNum("META_PRICE_IMAGE_PER_IMAGE", IMAGE_PER_IMAGE) * 1e6);
  if (!usage) return 0;
  const inTok = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const cachedTok = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const outTok = usage.completion_tokens ?? usage.output_tokens ?? 0;
  // tokens x (USD per 1M tokens) = micro-USD
  return Math.round((inTok - cachedTok) * chatPrice(model, "IN") + cachedTok * chatPrice(model, "CACHED") + outTok * chatPrice(model, "OUT"));
}

export async function recordUsage(model: string, usage: Usage | undefined, images = 0, audioMs = 0): Promise<void> {
  const tokens = (usage?.prompt_tokens ?? usage?.input_tokens ?? 0) + (usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  if (tokens) await bump("tokens", model, tokens);
  const micro = costMicroUsd(model, usage, images, audioMs);
  if (micro) await bump("spend_micro_usd", "global", micro);
}

// True when today's estimated spend is over DEMO_DAILY_SPEND_USD (default $15).
// Blocks uploads and staging only; browsing, booking, payment and cached
// units keep working. Chat has its own caps.
export async function spendBlocked(): Promise<boolean> {
  const { rows } = await pool().query<{ n: string }>(
    "select coalesce(sum(n),0)::text n from usage_counters where day = $1 and kind = 'spend_micro_usd'", [todayCairo()]);
  const over = Number(rows[0].n) / 1e6 >= envNum("DEMO_DAILY_SPEND_USD", 15);
  if (over) console.warn("[guard] DEMO_QUOTA: daily spend ceiling reached");
  return over;
}
