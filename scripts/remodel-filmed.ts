// Re-model the filmed demo units with RUBRIC_V1 (docs/RUBRIC.md): 1 fps frames
// from the owner's local video -> Blob demo/<slug>/frames/ -> survey -> rubric
// -> listing v2. Seeded data runs on muse-spark-1.3 (do not set the dev switch).
// Needs public/demo/<slug>.mp4 locally + ffmpeg. Run: pnpm remodel-filmed [slug]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "../lib/db/pg";
import { putPublic } from "../lib/blob";
import { analyzeUnit, saveAnalysis } from "../lib/pipeline/ingest";
import { area } from "../lib/pipeline/rubric";
import { nonPiiModel } from "../lib/meta/client";
import type { UploadOwner } from "../lib/pipeline/specs-listing";

const SLUGS = ["full", "empty1", "empty2"];

async function main() {
  const only = process.argv[2];
  console.log(`model: ${nonPiiModel()}`);
  for (const slug of SLUGS.filter((s) => !only || s === only)) {
    const { rows } = await pool().query<UploadOwner & { id: string }>(
      "select id, kind, district, rent_egp, daily_egp, floor_text, available_from::text from units where slug = $1", [slug]);
    if (!rows[0]) { console.log(`${slug}: not in DB, skipped`); continue; }
    const { id, ...owner } = rows[0];
    const dir = mkdtempSync(join(tmpdir(), `offisio-${slug}-`));
    try {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `public/demo/${slug}.mp4`, "-vf", "fps=1,scale='if(gt(iw,ih),1024,-2)':'if(gt(iw,ih),-2,1024)'", "-q:v", "4", join(dir, "f-%02d.jpg")]);
      const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().slice(0, 30);
      const frames = [];
      for (const [i, f] of files.entries())
        frames.push({ url: await putPublic(`demo/${slug}/frames/${f}`, readFileSync(join(dir, f)), "image/jpeg"), t: i });
      const a = await analyzeUnit(owner, frames);
      await saveAnalysis(id, frames, a);
      console.log(`\n== ${slug}: ${frames.length} frames, hero frame ${a.heroIndex}`);
      for (const s of a.survey.spaces) console.log(`  ${s.id} ${s.type} ${s.width_m ?? "?"}x${s.length_m ?? "?"} = ${area(s) ?? "?"} m2 (${s.label_en})`);
      for (const u of a.uses) console.log(`  -> ${u.use}: ${u.verdict} | ${u.reasons_en.join(" ")}`);
      console.log(`  title: ${a.listing.title_en}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  await pool().end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
