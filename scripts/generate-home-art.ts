// Generate decorative homepage art with muse-image-1.0 (Meta Model API).
// These are illustrations only — never listing photos, never stored in media.
// Output: public/home/hero-office.jpg, public/home/fit-concept.jpg
// Run: pnpm tsx scripts/generate-home-art.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnvLocal, MODELS, requireKey } from "../lib/meta/client";

const BASE = "https://api.meta.ai/v1";
const ART: { file: string; prompt: string }[] = [
  {
    file: "hero-office.jpg",
    prompt:
      "Warm editorial illustration of a bright Cairo office interior, wide windows with city light, wooden desks, plants, people working silhouettes, paper-collage torn-edge style, muted brick red, mustard and deep teal palette on warm paper background, flat illustration, no text, no logos, decorative artwork not a photograph",
  },
  {
    file: "fit-concept.jpg",
    prompt:
      "Editorial illustration showing one bare empty office room transforming into a fitted startup office, split view with a torn paper edge down the middle, left side empty room, right side desks with monitors and chairs and plants, warm paper collage style, muted brick red, mustard and deep teal palette, flat illustration, no text, no logos, decorative artwork not a photograph",
  },
];

async function generate(prompt: string): Promise<Buffer> {
  const key = requireKey();
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELS.image, prompt, size: "1536x1024" }),
  });
  const text = await res.text();
  console.log(`/images/generations ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`generations failed ${res.status}: ${text.slice(0, 400)}`);
  const data = (JSON.parse(text) as { data?: { b64_json?: string; url?: string }[] }).data?.[0];
  if (data?.b64_json) return Buffer.from(data.b64_json, "base64");
  if (data?.url) return Buffer.from(await (await fetch(data.url)).arrayBuffer());
  throw new Error("image response has neither b64_json nor url");
}

async function main() {
  loadEnvLocal();
  mkdirSync("public/home", { recursive: true });
  for (const art of ART) {
    const bytes = await generate(art.prompt);
    const path = `public/home/${art.file}`;
    writeFileSync(path, bytes);
    // The API returns WebP bytes; transcode to real JPEG for the .jpg name.
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("ffmpeg", ["-y", "-i", path, "-q:v", "3", `${path}.tmp.jpg`], { stdio: "ignore" });
      writeFileSync(path, (await import("node:fs")).readFileSync(`${path}.tmp.jpg`));
      (await import("node:fs")).unlinkSync(`${path}.tmp.jpg`);
    } catch { console.log("ffmpeg unavailable, left original bytes in", path); }
    console.log("wrote", art.file, bytes.length, "bytes");
  }
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
