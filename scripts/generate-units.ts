// Generate 6 synthetic demo units: muse-image-1.0 frames -> slideshow mp4
// -> Blob uploads -> existing upload pipeline (specs -> listing).
// Synthetic only, no PII. Never presented as filmed offices (synthetic meta).
// Run: pnpm generate-units [--only <slug>] [--force]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { putPublic } from "../lib/blob";
import { pool } from "../lib/db/pg";
import { addMedia, createUploadedUnit, generateAvailability, saveGenerated, setUnitStatus, type RentPeriod } from "../lib/db/store";
import { loadEnvLocal, MODELS, requireKey } from "../lib/meta/client";
import type { UnitKind } from "../lib/meta/prompts";
import { generateListing, generateSpecs, type UploadOwner } from "../lib/pipeline/specs-listing";

const BASE = "https://api.meta.ai/v1";

interface GenUnit {
  slug: string; district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; kind: UnitKind; brief: string;
}

// Fixed room brief per unit: the brief string is used verbatim in every
// frame prompt for that unit; only the camera position varies.
const UNITS: GenUnit[] = [
  {
    slug: "gen-zamalek", district: "Zamalek, Cairo", rent_egp: 18500, daily_egp: 1250, floor_text: "4th", kind: "furnished",
    brief: "Photorealistic interior of one single furnished office room, about 28 square metres, three light-oak desks in a row each with a black mesh office chair and a desktop monitor, warm white walls, two tall windows with sheer curtains on the left wall with bright daylight, light wood laminate flooring, one white wall-mounted air conditioner, a small green potted plant by the window, recessed ceiling lights, no people, no text, no logos",
  },
  {
    slug: "gen-heliopolis", district: "Heliopolis, Cairo", rent_egp: 13500, daily_egp: 900, floor_text: "2nd", kind: "furnished",
    brief: "Photorealistic interior of one single furnished office room, about 22 square metres, two white desks facing each other each with a grey fabric office chair and a laptop, cream walls, one wide window with white blinds on the far wall with bright daylight, beige ceramic tile flooring, one white wall-mounted air conditioner, a small bookshelf against the right wall, recessed ceiling lights, no people, no text, no logos",
  },
  {
    slug: "gen-new-cairo", district: "New Cairo", rent_egp: 16500, daily_egp: 1100, floor_text: "1st", kind: "furnished",
    brief: "Photorealistic interior of one single furnished office room, about 32 square metres, four dark walnut desks in two rows each with a black office chair and a desktop monitor, light grey walls, floor-to-ceiling windows along the right wall with bright daylight, polished light grey tile flooring, two white wall-mounted air conditioners, a tall green potted plant in the corner, recessed ceiling lights, no people, no text, no logos",
  },
  {
    slug: "gen-nasr-city", district: "Nasr City, Cairo", rent_egp: 9000, daily_egp: null, floor_text: "Ground", kind: "semifinished",
    brief: "Photorealistic interior of one single bare semifinished office room, about 30 square metres, completely empty with no furniture at all, unpainted pale plaster walls with patches of primer, bare grey concrete flooring, one plain window with an aluminium frame on the far wall with moderate daylight, exposed ceiling with a single hanging bulb, one closed plain wooden door, no desks, no chairs, no people, no text, no logos",
  },
  {
    slug: "gen-alex-chatby", district: "Chatby, Alexandria", rent_egp: 8500, daily_egp: 600, floor_text: "3rd", kind: "furnished",
    brief: "Photorealistic interior of one single furnished office room, about 20 square metres, two light wood desks each with a blue fabric office chair and a laptop, white walls, two windows with white shutters on the left wall with bright Mediterranean daylight, warm terracotta ceramic tile flooring, one white wall-mounted air conditioner, a small potted olive plant by the window, a simple ceiling light, no people, no text, no logos",
  },
  {
    slug: "gen-alex-louran", district: "Louran, Alexandria (near Bibliotheca Alexandrina)", rent_egp: 12000, daily_egp: 850, floor_text: "5th", kind: "furnished",
    brief: "Photorealistic interior of one single furnished office room, about 26 square metres, three white desks in an L shape each with a light grey mesh office chair and a desktop monitor, soft white walls, a wide window and a small balcony door on the far wall with bright sea daylight, light oak laminate flooring, one white wall-mounted air conditioner, a bookshelf with a few books on the right wall, recessed ceiling lights, no people, no text, no logos",
  },
];

const CAMERAS_FURNISHED = [
  "photographed from the entrance, wide-angle view of the whole room",
  "photographed from the opposite corner, wide-angle view of the whole room",
  "photographed from the window side looking across the room",
  "low desk-level detail view close to the desks and floor",
  "diagonal overview from a high corner of the room",
] as const;

const CAMERAS_BARE = [
  "photographed from the entrance, wide-angle view of the whole room",
  "photographed from the opposite corner, wide-angle view of the whole room",
  "photographed from the window side looking across the room",
  "low corner detail view close to the wall and floor",
  "diagonal overview from a high corner of the room",
] as const;

async function generateImage(prompt: string): Promise<Buffer> {
  const key = requireKey();
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELS.image, prompt, size: "1536x1024" }),
  });
  const text = await res.text();
  console.log(`/images/generations ${res.status}`);
  if (!res.ok) throw new Error(`generations failed ${res.status}: ${text.slice(0, 400)}`);
  const data = (JSON.parse(text) as { data?: { b64_json?: string; url?: string }[] }).data?.[0];
  if (data?.b64_json) return Buffer.from(data.b64_json, "base64");
  if (data?.url) return Buffer.from(await (await fetch(data.url)).arrayBuffer());
  throw new Error("image response has neither b64_json nor url");
}

function toJpeg(raw: Buffer, dest: string): Buffer {
  const tmp = `${dest}.raw`;
  writeFileSync(tmp, raw);
  try {
    execFileSync("ffmpeg", ["-y", "-i", tmp, "-q:v", "3", dest], { stdio: "ignore" });
    return readFileSync(dest);
  } catch {
    console.log(`ffmpeg transcode unavailable, keeping original bytes for ${dest}`);
    writeFileSync(dest, raw);
    return raw;
  } finally {
    try { unlinkSync(tmp); } catch { /* already gone */ }
  }
}

function buildSlideshow(dir: string): string {
  const out = join(dir, "walkthrough.mp4");
  execFileSync("ffmpeg", ["-y", "-framerate", "1/2", "-i", join(dir, "frame-%d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", out], { stdio: "inherit" });
  return out;
}

function containsRent(title: string, rent: number): boolean {
  return title.includes(String(rent)) || title.includes(rent.toLocaleString("en-US"));
}

function warnRentTitles(slug: string, rent: number, titleEn: string, titleAr: string): void {
  if (!containsRent(titleEn, rent)) console.warn(`[warn] ${slug}: title_en does not contain rent ${rent}: ${titleEn}`);
  if (!containsRent(titleAr, rent)) console.warn(`[warn] ${slug}: title_ar does not contain rent ${rent}: ${titleAr}`);
}

// Titles must carry the correct rent (plan step 2 acceptance). If the model
// omitted it, append the factual owner rent deterministically — never invent.
export function withRentInTitles<T extends { title_en: string; title_ar: string }>(listing: T, rent: number): T {
  const en = containsRent(listing.title_en, rent) ? listing.title_en : `${listing.title_en} - EGP ${rent.toLocaleString("en-US")}/mo`;
  const ar = containsRent(listing.title_ar, rent) ? listing.title_ar : `${listing.title_ar} - ${rent.toLocaleString("en-US")} جنيه/شهر`;
  return { ...listing, title_en: en, title_ar: ar };
}

async function unitExists(slug: string): Promise<boolean> {
  const { rows } = await pool().query("select id from units where slug = $1", [slug]);
  return rows.length > 0;
}

async function deleteUnit(slug: string): Promise<void> {
  await pool().query("delete from units where slug = $1", [slug]);
}

async function runUnit(unit: GenUnit, today: string): Promise<void> {
  const dir = join(".scratch/gen-units", unit.slug);
  mkdirSync(dir, { recursive: true });
  const cameras = unit.kind === "semifinished" ? CAMERAS_BARE : CAMERAS_FURNISHED;
  const framePaths: string[] = [];
  const frameBytes: Buffer[] = [];
  for (let i = 0; i < cameras.length; i++) {
    const prompt = `${unit.brief}, ${cameras[i]}`;
    console.log(`[${unit.slug}] frame ${i + 1}/5`);
    const raw = await generateImage(prompt);
    const dest = join(dir, `frame-${i + 1}.jpg`);
    frameBytes.push(toJpeg(raw, dest));
    framePaths.push(dest);
  }
  const videoPath = buildSlideshow(dir);
  const frameUrls: string[] = [];
  for (let i = 0; i < framePaths.length; i++)
    frameUrls.push(await putPublic(`uploads/${unit.slug}/frame-${i + 1}.jpg`, frameBytes[i], "image/jpeg"));
  const videoUrl = await putPublic(`uploads/${unit.slug}/walkthrough.mp4`, readFileSync(videoPath), "video/mp4");

  const owner: UploadOwner = { district: unit.district, rent_egp: unit.rent_egp, daily_egp: unit.daily_egp, floor_text: unit.floor_text, available_from: today, kind: unit.kind };
  const rentPeriods: RentPeriod[] = unit.kind === "furnished" ? ["daily", "monthly"] : ["long_term"];
  let created = false;
  try {
    const unitId = await createUploadedUnit({ slug: unit.slug, kind: unit.kind, district: unit.district, rent_egp: unit.rent_egp, daily_egp: unit.daily_egp, floor_text: unit.floor_text, available_from: today, rent_periods: rentPeriods });
    created = true;
    // Hero first so it is identifiable; all frames stored as keyframes.
    const order = [0, ...frameUrls.map((_, i) => i).filter((i) => i !== 0)];
    for (const i of order)
      await addMedia(unitId, "keyframe", frameUrls[i], null, i === 0 ? { hero: true, synthetic: true, source: "muse-image-1.0" } : { synthetic: true, source: "muse-image-1.0" });
    await addMedia(unitId, "video", videoUrl, null, { synthetic: true });
    const dataUrls = frameBytes.map((b) => `data:image/jpeg;base64,${b.toString("base64")}`);
    const specs = await generateSpecs(dataUrls, owner);
    const rawListing = await generateListing(specs, owner);
    warnRentTitles(unit.slug, unit.rent_egp, rawListing.title_en, rawListing.title_ar);
    const listing = withRentInTitles(rawListing, unit.rent_egp);
    await saveGenerated(unitId, specs, listing);
    await generateAvailability(unitId, today);
    await setUnitStatus(unit.slug, "ready");
    console.log(`[${unit.slug}] ready`);
  } catch (e) {
    if (created) { try { await setUnitStatus(unit.slug, "failed"); } catch { /* keep original error */ } }
    throw e;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;
  if (onlyIdx >= 0 && !only) throw new Error("--only requires a slug");
  const selected = only ? UNITS.filter((u) => u.slug === only) : UNITS;
  if (selected.length === 0) throw new Error(`unknown slug for --only: ${only}`);
  if (args.includes("--fix-titles")) {
    // Re-runnable title repair for already-created units: no model calls.
    for (const unit of selected) {
      const { rows } = await pool().query<{ title_en: string | null; title_ar: string | null }>(
        "select title_en, title_ar from units where slug = $1", [unit.slug]);
      if (!rows[0]?.title_en || !rows[0]?.title_ar) { console.log(`[${unit.slug}] no listing yet, skipping`); continue; }
      const fixed = withRentInTitles({ title_en: rows[0].title_en, title_ar: rows[0].title_ar }, unit.rent_egp);
      await pool().query("update units set title_en = $2, title_ar = $3 where slug = $1", [unit.slug, fixed.title_en, fixed.title_ar]);
      console.log(`[${unit.slug}] titles fixed`);
    }
    try { await pool().end(); } catch { /* ignore */ }
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  let failed = 0;
  for (const unit of selected) {
    try {
      if (await unitExists(unit.slug)) {
        if (!force) { console.log(`[${unit.slug}] exists, skipping (use --force to regenerate)`); continue; }
        await deleteUnit(unit.slug);
        console.log(`[${unit.slug}] deleted existing row (--force)`);
      }
      await runUnit(unit, today);
    } catch (e) {
      failed++;
      console.error(`[${unit.slug}] FAILED: ${(e as Error).message}`);
    }
  }
  try { await pool().end(); } catch { /* pool may not be started */ }
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
