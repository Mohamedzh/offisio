// Meta Model API client — only place model IDs / base URL live (AGENTS.md).
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
} as const;

const BASE = "https://api.meta.ai/v1";

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

async function call<T = Record<string, unknown>>(path: string, init: RequestInit, tries = 3): Promise<T> {
  const key = requireKey();
  let last: Error = new Error("unknown");
  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) } });
      const text = await res.text();
      console.log(`[meta] ${path} ${res.status} ${Date.now() - t0}ms`);
      if (res.status === 429 || res.status >= 500) {
        last = new Error(text.slice(0, 500));
        await new Promise((r) => setTimeout(r, [2000, 8000][i] ?? 8000));
        continue;
      }
      if (!res.ok) throw new Error(`Meta ${path} ${res.status}: ${text.slice(0, 800)}`);
      return (text ? JSON.parse(text) : {}) as T;
    } catch (e) {
      last = e as Error;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw last;
}

export const meta = {
  // PII-safe path: never contributor (AGENTS.md routing table).
  product: {
    chat: (body: ChatBody) =>
      call("/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODELS.spark, ...body }) }),
  },
  public: {
    chat: (body: ChatBody) =>
      call("/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODELS.sparkContributor, ...body }) }),
  },
  models: () => call<{ data?: { id: string }[] }>("/models", { method: "GET" }),
  imageEdit: async ({ imagePath, prompt, maskPath }: ImageEditOpts) => {
    const { readFile } = await import("node:fs/promises");
    // imagePath may be a Blob/remote URL (Vercel) or a local disk path.
    const load = async (p: string): Promise<Blob> => {
      if (p.startsWith("http://") || p.startsWith("https://")) {
        const r = await fetch(p);
        if (!r.ok) throw new Error(`fetch image ${p} failed: ${r.status}`);
        return await r.blob();
      }
      return new Blob([await readFile(p)]);
    };
    const form = new FormData();
    form.append("model", MODELS.image);
    form.append("prompt", prompt);
    form.append("image", await load(imagePath), "hero.jpg");
    if (maskPath) form.append("mask", await load(maskPath), "mask.png");
    return call<{ data?: { b64_json?: string; url?: string }[] }>("/images/edits", { method: "POST", body: form });
  },
};
