// Generate synthetic demo units from floor-plan briefs (data/seed/synthetic-briefs.json,
// owner-approved 2026-10-30): per space 1-2 muse-image-1.0 frames in walk order ->
// 2 s/frame slideshow -> Blob demo/<slug>/v2/ -> the same analysis pipeline as a
// live upload (survey -> rubric -> listing v2). Synthetic only, no PII; always
// badged as AI-generated photos. Staging runs separately: pnpm stage-units.
// Run: pnpm generate-units [--only <slug>] [--force] [--dry]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { putPublic } from "../lib/blob";
import { pool } from "../lib/db/pg";
import { addMedia, createUploadedUnit, generateAvailability, setUnitStatus, todayCairo, type RentPeriod } from "../lib/db/store";
import { meta } from "../lib/meta/client";
import type { UnitKind } from "../lib/meta/prompts";
import type { UploadOwner } from "../lib/pipeline/specs-listing";
import { analyzeUnit, saveAnalysis } from "../lib/pipeline/ingest";
import { area, USES, type Use } from "../lib/pipeline/rubric";
import type { Survey, SpaceType } from "../lib/pipeline/survey";
import { keyframesOf } from "../lib/db/store";

interface BriefSpace { type: string; w: number; l: number; desc: string; frames: number }
interface Brief { slug: string; district: string; kind: UnitKind; rent_egp: number; daily_egp: number | null; floor_text: string; style: string; spaces: BriefSpace[]; target_uses: string[] }
export const BRIEFS = (JSON.parse(readFileSync("data/seed/synthetic-briefs.json", "utf8")) as { units: Brief[] }).units;

// "clinic (after fit-out)" -> "clinic"
export const targetUses = (b: Brief): Use[] => b.target_uses.map((t) => t.split(" ")[0]).filter((t): t is Use => (USES as readonly string[]).includes(t));

// The brief IS the floor plan: build the survey from it, frames mapped exactly.
export function surveyFromBrief(b: Brief): Survey {
  let frame = 0;
  const spaces = b.spaces.map((s, i) => {
    const frames = Array.from({ length: s.frames }, () => frame++);
    const isRoom = s.type === "room" || s.type === "other";
    return {
      id: `s${i + 1}`, type: s.type as SpaceType, label_en: s.desc, frames, best_frame: frames[0],
      width_m: s.w, length_m: s.l, dims_confidence: 1, windows: isRoom ? 1 : 0, natural_light: isRoom ? "bright" as const : null,
      plumbing: { wc: s.type === "bathroom" ? true : null, sink: s.type === "bathroom" || s.type === "kitchenette" ? true : null, water_stub: /water|stub/.test(s.desc) ? true : null, drain: /drain/.test(s.desc) ? true : null },
      finish: b.kind === "semifinished" ? "semifinished" as const : "finished" as const, furnished: b.kind === "furnished" && isRoom, notes: "from floor-plan brief",
    };
  });
  return { spaces, adjacency: spaces.slice(1).map((s, i) => [spaces[i].id, s.id] as [string, string]), entrance_space: spaces.find((s) => s.type === "entrance")?.id ?? null,
    has_ac: b.kind === "furnished" ? true : null, ac_units_visible: null, flooring: null, condition: b.kind === "furnished" ? "good" : "needs_work", condition_confidence: 1, notes_ar: null };
}
const CAMERAS = ["photographed from the doorway, wide-angle view of the whole space", "photographed from the opposite corner, wide-angle view"];

const framePrompt = (b: Brief, s: BriefSpace, cam: string) =>
  `Photorealistic interior photograph of an office unit in ${b.district}, Egypt: ${b.style}. This photo shows ${s.desc}, about ${s.w} x ${s.l} metres, ${cam}. Natural phone-camera photo, no people, no text, no logos.`;

// Titles must carry the correct rent; append the factual owner rent if the model omitted it.
const hasRent = (t: string, r: number) => t.includes(String(r)) || t.includes(r.toLocaleString("en-US"));
function withRentInTitles<T extends { title_en: string; title_ar: string }>(l: T, rent: number): T {
  return { ...l, title_en: hasRent(l.title_en, rent) ? l.title_en : `${l.title_en} - EGP ${rent.toLocaleString("en-US")}/mo`,
    title_ar: hasRent(l.title_ar, rent) ? l.title_ar : `${l.title_ar} - ${rent.toLocaleString("en-US")} جنيه/شهر` };
}

async function generateFrame(prompt: string, dest: string): Promise<Buffer> {
  const d = (await meta.imageGenerate(prompt)).data?.[0];
  const raw = d?.b64_json ? Buffer.from(d.b64_json, "base64") : d?.url ? Buffer.from(await (await fetch(d.url)).arrayBuffer()) : null;
  if (!raw) throw new Error("image response has neither b64_json nor url");
  writeFileSync(`${dest}.raw`, raw);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${dest}.raw`, "-vf", "scale=1024:-2", "-q:v", "3", dest]); // JPEG, long side 1024
  return readFileSync(dest);
}

async function runUnit(b: Brief): Promise<void> {
  const dir = join(".scratch/gen-units-v2", b.slug);
  mkdirSync(dir, { recursive: true });
  const shots = b.spaces.flatMap((s) => CAMERAS.slice(0, s.frames).map((cam) => ({ s, cam })));
  const frames: { url: string; t: number }[] = [];
  for (const [i, { s, cam }] of shots.entries()) {
    console.log(`[${b.slug}] frame ${i + 1}/${shots.length}: ${s.type}`);
    const bytes = await generateFrame(framePrompt(b, s, cam), join(dir, `frame-${i + 1}.jpg`));
    frames.push({ url: await putPublic(`demo/${b.slug}/v2/frame-${String(i + 1).padStart(2, "0")}.jpg`, bytes, "image/jpeg"), t: i * 2 });
  }
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1/2", "-i", join(dir, "frame-%d.jpg"), "-vf", "scale=1024:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", join(dir, "walkthrough.mp4")]);
  const videoUrl = await putPublic(`demo/${b.slug}/v2/walkthrough.mp4`, readFileSync(join(dir, "walkthrough.mp4")), "video/mp4");

  const today = todayCairo();
  const owner: UploadOwner = { district: b.district, rent_egp: b.rent_egp, daily_egp: b.daily_egp, floor_text: b.floor_text, available_from: today, kind: b.kind };
  const rent_periods: RentPeriod[] = b.kind === "furnished" ? ["daily", "monthly"] : ["long_term"];
  const unitId = await createUploadedUnit({ slug: b.slug, ...owner, rent_periods });
  try {
    await addMedia(unitId, "video", videoUrl, null, { synthetic: true });
    const a = await analyzeUnit(owner, frames, surveyFromBrief(b));
    a.listing = withRentInTitles(a.listing, b.rent_egp);
    await saveAnalysis(unitId, frames, a, { synthetic: true, source: "muse-image-1.0" });
    await generateAvailability(unitId, today);
    await setUnitStatus(b.slug, "ready");
    console.log(`[${b.slug}] ready: ${a.survey.spaces.map((s) => `${s.type} ${area(s) ?? "?"}m2`).join(", ")}`);
    console.log(`  uses: ${a.uses.map((u) => `${u.use}=${u.verdict}`).join(" ")}`);
  } catch (e) { await setUnitStatus(b.slug, "failed"); throw e; }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const selected = BRIEFS.filter((b) => !only || b.slug === only);
  if (!selected.length) throw new Error(`unknown slug: ${only}`);
  const frames = selected.reduce((n, b) => n + b.spaces.reduce((m, s) => m + s.frames, 0), 0);
  console.log(`${selected.length} units, ${frames} frames (~$${(frames * 0.01).toFixed(2)} generation + ~$0.03/unit analysis)`);
  if (args.includes("--dry")) { await pool().end(); return; }
  if (args.includes("--reanalyze")) {
    // Re-run analysis on already-generated frames (no image generation).
    for (const b of selected) {
      const { rows } = await pool().query<{ id: string }>("select id from units where slug = $1", [b.slug]);
      if (!rows[0]) { console.log(`[${b.slug}] not generated yet`); continue; }
      const frames = (await keyframesOf(rows[0].id)).sort((x, y) => x.frame - y.frame).map((f) => ({ url: f.url, t: f.frame * 2 }));
      const owner: UploadOwner = { district: b.district, rent_egp: b.rent_egp, daily_egp: b.daily_egp, floor_text: b.floor_text, available_from: todayCairo(), kind: b.kind };
      const a = await analyzeUnit(owner, frames, surveyFromBrief(b));
      a.listing = withRentInTitles(a.listing, b.rent_egp);
      await saveAnalysis(rows[0].id, frames, a, { synthetic: true, source: "muse-image-1.0" });
      // Roles may now point at different spaces: retire renders (re-staging hits the cache where unchanged).
      await pool().query("update media set is_current = false where unit_id = $1 and kind = 'staged'", [rows[0].id]);
      console.log(`[${b.slug}] ${a.uses.map((u) => `${u.use}=${u.verdict}`).join(" ")}`);
    }
    await pool().end(); return;
  }
  let failed = 0;
  for (const b of selected) {
    try {
      const { rows } = await pool().query<{ n: number }>("select count(*)::int n from bookings b join units u on u.id = b.unit_id where u.slug = $1", [b.slug]);
      const exists = (await pool().query("select 1 from units where slug = $1", [b.slug])).rows.length > 0;
      if (exists && !args.includes("--force")) { console.log(`[${b.slug}] exists, skipping (use --force)`); continue; }
      if (exists && rows[0].n > 0) { console.log(`[${b.slug}] has bookings, not regenerated`); continue; }
      if (exists) await pool().query("delete from units where slug = $1", [b.slug]);
      await runUnit(b);
    } catch (e) { failed++; console.error(`[${b.slug}] FAILED: ${(e as Error).message}`); }
  }
  await pool().end();
  if (failed) process.exit(1);
}
if (process.argv[1]?.includes("generate-units")) main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
