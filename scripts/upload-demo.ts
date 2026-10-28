// Upload demo assets to Vercel Blob. Run: pnpm upload-demo
// - Every jpg under public/demo/<unit>/ -> demo/<unit>/<file>
// - public/demo/<unit>.mp4 -> compressed ~720p -> demo/<unit>/walkthrough.mp4
// Writes data/seed/blob-urls.json (used by scripts/seed.ts) and prints all URLs.
// Requires BLOB_READ_WRITE_TOKEN (Vercel > Storage > Blob) in .env.local or env.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { loadEnvLocal } from "../lib/meta/client";

const UNITS = ["full", "empty1", "empty2"] as const;
type Manifest = Record<string, Record<string, string>>;

async function putFile(pathname: string, file: string, contentType: string): Promise<string> {
  const res = await put(pathname, readFileSync(file), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
  console.log(res.url);
  return res.url;
}

async function main() {
  loadEnvLocal();
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error("BLOB_READ_WRITE_TOKEN missing: create a Blob store (Vercel > Storage > Blob) and add the token to .env.local");
  const manifest: Manifest = {};
  mkdirSync(".scratch/blob-demo", { recursive: true });
  for (const unit of UNITS) {
    manifest[unit] = {};
    const dir = join("public/demo", unit);
    if (!existsSync(dir)) throw new Error(`missing demo dir ${dir}`);
    const jpgs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".jpg")).sort();
    if (jpgs.length === 0) throw new Error(`no jpgs in ${dir}`);
    for (const file of jpgs)
      manifest[unit][file] = await putFile(`demo/${unit}/${file}`, join(dir, file), "image/jpeg");
    const mp4 = join("public/demo", `${unit}.mp4`);
    if (existsSync(mp4)) {
      const compressed = join(".scratch/blob-demo", `${unit}-720.mp4`);
      execFileSync("ffmpeg", ["-y", "-i", mp4, "-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-an", compressed], { stdio: "inherit" });
      manifest[unit]["walkthrough.mp4"] = await putFile(`demo/${unit}/walkthrough.mp4`, compressed, "video/mp4");
    } else {
      console.log(`skip video for ${unit}: ${mp4} not found`);
    }
  }
  writeFileSync("data/seed/blob-urls.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log("wrote data/seed/blob-urls.json");
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
