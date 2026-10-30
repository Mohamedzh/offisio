// Meta model client — only place model IDs / base URLs live (AGENTS.md).
// Product calls go to the Meta Model API. Local dev may route non-PII calls to
// our own Muse Spark Open deployment on Modal (open-weight Meta model).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const MODELS = {
  spark: "muse-spark-1.3",
  sparkContributor: "muse-spark-1.3-contributor",
  image: "muse-image-1.0",
  // NOTE: SAM 3.1 dropped 2026-10-27 — listed in /models but no callable
  // segmentation endpoint in the OpenAI-shaped API. Prompt-guided edits
  // passed on furnished + 2 bare units. Revisit if removal quality fails.
  sam: "sam-3.1",
  // Open-weight Muse Spark served on our Modal deployment (dev only).
  sparkOpen: "meta-models/Muse-Spark-Open-816B-A42B",
} as const;

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
    const j = json as { usage?: Record<string, number>; data?: unknown[] } | null;
    const images = model.startsWith("muse-image") ? j?.data?.length ?? 0 : 0;
    if (j?.usage || images) await (await import("../guard")).recordUsage(model, j?.usage, images);
  } catch (e) { console.warn("[meta] usage not recorded:", (e as Error).message); }
}

async function call<T = Record<string, unknown>>(path: string, init: RequestInit, model: string, tries = 3): Promise<T> {
  const ep = endpointFor(model);
  const key = ep.auth();
  if (!ep.base) throw new Error("MODAL_SPARK_URL missing in .env.local");
  let last: Error = new Error("unknown");
  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(ep.base + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) } });
      const text = await res.text();
      console.log(`[meta] ${ep === META ? "" : "modal "}${path} ${res.status} ${Date.now() - t0}ms`);
      if (res.status === 429 || res.status >= 500) {
        last = new Error(text.slice(0, 500));
        await new Promise((r) => setTimeout(r, [2000, 8000][i] ?? 8000));
        continue;
      }
      if (!res.ok) throw new Error(`Meta ${path} ${res.status}: ${text.slice(0, 800)}`);
      const json = (text ? JSON.parse(text) : {}) as T;
      await track(model, json);
      return json;
    } catch (e) {
      last = e as Error;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw last;
}

const chat = (model: string) => (body: ChatBody) =>
  call("/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, ...body }) }, model);

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

export const meta = {
  // PII-safe path: never contributor (AGENTS.md routing table).
  product: { chat: chat(MODELS.spark) },
  // Non-PII product data (specs, listing): spark, or contributor in local dev.
  nonPii: { chat: (body: ChatBody) => chat(nonPiiModel())(body) },
  // Public/synthetic test calls: Modal when configured locally, else contributor.
  public: { chat: (body: ChatBody) => chat(!process.env.VERCEL && process.env.MODAL_SPARK_URL ? MODELS.sparkOpen : MODELS.sparkContributor)(body) },
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
