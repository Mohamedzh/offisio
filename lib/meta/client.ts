// Meta model client — only place model IDs / base URLs live (AGENTS.md).
// Product calls go to the Meta Model API. Local dev may route non-PII calls to
// our own Muse Spark Open deployment on Modal (open-weight Meta model).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const MODELS = {
  spark: "muse-spark-1.3",
  sparkContributor: "muse-spark-1.3-contributor",
  image: "muse-image-1.0",
  // Speech-to-text for WhatsApp voice notes (PII path only, never contributor).
  transcribe: "muse-voice-transcribe-1.0",
  // NOTE: SAM 3.1 dropped 2026-10-27 — listed in /models but no callable
  // segmentation endpoint in the OpenAI-shaped API. Prompt-guided edits
  // passed on furnished + 2 bare units. Revisit if removal quality fails.
  sam: "sam-3.1",
  // Open-weight Muse Spark served on our Modal deployment (dev only).
  sparkOpen: "meta-models/Muse-Spark-Open-816B-A42B",
} as const;
// Speech-to-text endpoint (dev.meta.ai/docs/api-reference/voice/transcribe).
export const TRANSCRIBE_PATH = "/asr/transcribe";

const BASE = "https://api.meta.ai/v1";

interface Endpoint { base: string; auth: () => string }
const META: Endpoint = { base: BASE, auth: () => requireKey() };
const MODAL: Endpoint = {
  base: "",
  auth: () => {
    loadEnvLocal();
    if (!process.env.MODAL_KEY || !process.env.MODAL_SECRET) throw new Error("MODAL_KEY/MODAL_SECRET missing in .env.local");
    return `${process.env.MODAL_KEY}.${process.env.MODAL_SECRET}`;
  },
};
function endpointFor(model: string): Endpoint {
  loadEnvLocal();
  return model === MODELS.sparkOpen ? { ...MODAL, base: `${(process.env.MODAL_SPARK_URL ?? "").replace(/\/$/, "")}/v1` } : META;
}

export function loadEnvLocal(cwd: string = process.cwd()): boolean {
  const p = join(cwd, ".env.local");
  if (!existsSync(p)) return false;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
}

export function requireKey(): string {
  loadEnvLocal();
  const k = process.env.META_API_KEY;
  if (!k) throw new Error("META_API_KEY missing: create .env.local in repo root with META_API_KEY=<key> and re-run.");
  return k;
}

type ChatBody = Record<string, unknown>;
export interface ImageEditOpts { imagePath: string; prompt: string; maskPath?: string }

// Usage feeds the spend breaker (lib/guard.ts). Imported lazily to keep this
// module free of DB imports at load time; a failed write never fails the call.
async function track(model: string, json: unknown): Promise<void> {
  try {
    const j = json as { usage?: Record<string, number>; data?: unknown[]; audioDurationMs?: unknown } | null;
    const images = model.startsWith("muse-image") ? j?.data?.length ?? 0 : 0;
    const audioMs = typeof j?.audioDurationMs === "number" ? j.audioDurationMs : 0; // ASR: billed per audio second
    if (j?.usage || images || audioMs) await (await import("../guard")).recordUsage(model, j?.usage, images, audioMs);
  } catch (e) { console.warn("[meta] usage not recorded:", (e as Error).message); }
}

// HTTP error from call(). Non-retryable (4xx except 429, bad JSON) is rethrown at once.
export class MetaError extends Error {
  constructor(readonly status: number, message: string, readonly retryable = false) { super(message); this.name = "MetaError"; }
}
// redactBody: keep response bodies out of error messages (PII paths such as transcription).
interface CallOpts { tries?: number; timeoutMs?: number; redactBody?: boolean }

async function call<T = Record<string, unknown>>(path: string, init: RequestInit, model: string, opts: CallOpts = {}): Promise<T> {
  const { tries = 3, timeoutMs, redactBody = false } = opts;
  const ep = endpointFor(model);
  const key = ep.auth();
  if (!ep.base) throw new Error("MODAL_SPARK_URL missing in .env.local");
  let last: Error = new Error("unknown");
  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(ep.base + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) }, ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
      const text = await res.text();
      console.log(`[meta] ${ep === META ? "" : "modal "}${path} ${res.status} ${Date.now() - t0}ms`);
      const body = (n: number) => (redactBody ? "" : `: ${text.slice(0, n)}`);
      if (res.status === 429 || res.status >= 500) throw new MetaError(res.status, `Meta ${path} ${res.status}${body(500)}`, true);
      if (!res.ok) throw new MetaError(res.status, `Meta ${path} ${res.status}${body(800)}`);
      let json: T;
      try { json = (text ? JSON.parse(text) : {}) as T; } catch { throw new MetaError(res.status, `Meta ${path} ${res.status}: non-JSON response`); }
      await track(model, json);
      return json;
    } catch (e) {
      last = e as Error;
      if (e instanceof MetaError && !e.retryable) throw e;
      // 429/5xx back off longer; network errors and timeouts retry after 2 s.
      if (i < tries - 1) await new Promise((r) => setTimeout(r, e instanceof MetaError ? [2000, 8000][i] ?? 8000 : 2000));
    }
  }
  throw last;
}

const chat = (model: string, opts?: CallOpts) => (body: ChatBody) =>
  call("/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, ...body }) }, model, opts);

// Dev switch (AGENTS.md): local runs on our own/synthetic footage may send
// NON-PII calls to Muse Spark Open on Modal ("modal", preferred: own
// deployment, separate credits) or to the contributor model ("contributor").
// Ignored on Vercel, so production always uses muse-spark-1.3. Never for PII.
export function devModels(): "modal" | "contributor" | null {
  if (process.env.VERCEL) return null;
  const v = process.env.OFFISIO_DEV_MODELS;
  return v === "modal" || v === "contributor" ? v : null;
}
export function nonPiiModel(): string {
  const d = devModels();
  return d === "modal" ? MODELS.sparkOpen : d === "contributor" ? MODELS.sparkContributor : MODELS.spark;
}

// Real MIME type from magic bytes: muse-image-1.0 returns WebP, and edits
// reject a declared type that doesn't match the bytes.
function sniffImage(buf: Uint8Array): { type: string; ext: string } {
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.subarray(a, b));
  if (ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  if (buf[0] === 0x89 && ascii(1, 4) === "PNG") return { type: "image/png", ext: "png" };
  return { type: "image/jpeg", ext: "jpg" };
}

// Public data (synthetic tests): Modal when configured locally, else contributor.
export const publicModel = () => (!process.env.VERCEL && process.env.MODAL_SPARK_URL ? MODELS.sparkOpen : MODELS.sparkContributor);

// Voice note -> text (dev.meta.ai/docs/speech-to-text). The API only takes
// RIFF/WAVE mono 16-bit PCM at 16 or 24 kHz (see lib/audio.ts). Audio and
// transcript are PII: this hangs off meta.product only, never logs either, and
// errors carry the HTTP status only. Billed per audio second (no token usage):
// track() records audioDurationMs. One try: a retry would blow the webhook's time budget.
export interface Transcription { text: string; durationMs: number | null; raw: Record<string, unknown> }
async function transcribe(wav: Uint8Array, languageBias: string[] = ["Arabic", "English"]): Promise<Transcription> {
  const form = new FormData();
  const request = { mode: "PUSH_TO_TALK", model: MODELS.transcribe, audioEncoding: "WAV", languageBias };
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "voice.wav");
  const raw = await call<Record<string, unknown>>(TRANSCRIBE_PATH, { method: "POST", headers: { Accept: "application/json" }, body: form }, MODELS.transcribe, { tries: 1, timeoutMs: 20_000, redactBody: true });
  return { text: typeof raw.transcript === "string" ? raw.transcript.trim() : "", durationMs: typeof raw.audioDurationMs === "number" ? raw.audioDurationMs : null, raw };
}

export const meta = {
  // PII-safe path: never contributor (AGENTS.md routing table).
  // chatOnce: one try, 20 s timeout, body kept out of errors (webhook turns with a fixed time budget).
  product: { chat: chat(MODELS.spark), chatOnce: chat(MODELS.spark, { tries: 1, timeoutMs: 20_000, redactBody: true }), transcribe },
  // Non-PII product data (specs, listing): spark, or contributor in local dev.
  nonPii: { chat: (body: ChatBody) => chat(nonPiiModel())(body) },
  // Public/synthetic test calls: Modal when configured locally, else contributor.
  public: { chat: (body: ChatBody) => chat(publicModel())(body) },
  models: () => call<{ data?: { id: string }[] }>("/models", { method: "GET" }, "none"),
  // Text-to-image (synthetic demo frames only).
  imageGenerate: (prompt: string, size = "1536x1024") =>
    call<{ data?: { b64_json?: string; url?: string }[] }>("/images/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODELS.image, prompt, size }) }, MODELS.image),
  imageEdit: async ({ imagePath, prompt, maskPath }: ImageEditOpts) => {
    const { readFile } = await import("node:fs/promises");
    // imagePath may be a Blob/remote URL (Vercel) or a local disk path.
    const load = async (p: string): Promise<Uint8Array<ArrayBuffer>> => {
      if (p.startsWith("http://") || p.startsWith("https://")) {
        const r = await fetch(p);
        if (!r.ok) throw new Error(`fetch image ${p} failed: ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      }
      return new Uint8Array(await readFile(p)) as Uint8Array<ArrayBuffer>;
    };
    const form = new FormData();
    form.append("model", MODELS.image);
    form.append("prompt", prompt);
    const img = await load(imagePath); const kind = sniffImage(img);
    form.append("image", new Blob([img], { type: kind.type }), `hero.${kind.ext}`);
    if (maskPath) form.append("mask", new Blob([await load(maskPath)], { type: "image/png" }), "mask.png");
    return call<{ data?: { b64_json?: string; url?: string }[] }>("/images/edits", { method: "POST", body: form }, MODELS.image);
  },
};
