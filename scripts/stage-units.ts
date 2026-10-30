// Render use-driven fit-out concepts for units that have a survey (plan/06 6.6).
// --dry prints the plan and the number of image edits without calling a model.
// A real run retires legacy v1 renders (startup/clinic/training, unscoped empty).
// Run: pnpm stage-units [slug] [--dry]
import { pool } from "../lib/db/pg";
import { getUnit, stagedOf, unitRef, retireStaged } from "../lib/db/store";
import { planStaging, stageOne } from "../lib/pipeline/staging";
import type { Survey } from "../lib/pipeline/survey";
import type { UseVerdict } from "../lib/pipeline/rubric";

async function main() {
  const dry = process.argv.includes("--dry");
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const { rows } = await pool().query<{ slug: string }>("select slug from units where status = 'ready' order by created_at");
  let edits = 0;
  for (const { slug } of rows.filter((r) => !only || r.slug === only)) {
    const [ref, unit] = await Promise.all([unitRef(slug), getUnit(slug)]);
    const survey = unit?.specs.survey as Survey | undefined; const uses = unit?.specs.uses as UseVerdict[] | undefined;
    if (!ref || !survey || !uses) { console.log(`${slug}: no survey yet, skipped`); continue; }
    const jobs = planStaging(survey, uses);
    const staged = await stagedOf(ref.id);
    const v2 = new Set(staged.filter((m) => m.meta.prompt === "STAGE_PROMPTS_V2").map((m) => m.style));
    const emptied = new Set(staged.filter((m) => m.style === "empty" && m.meta.space_id).map((m) => String(m.meta.space_id)));
    const todo = jobs.filter((j) => !v2.has(j.style));
    const emptyEdits = ref.kind === "furnished" ? new Set(todo.map((j) => j.spaceId).filter((s) => !emptied.has(s))).size : 0;
    edits += todo.length + emptyEdits;
    console.log(`${slug} (${ref.kind}): ${jobs.map((j) => `${j.style}@${j.spaceId}#${j.frame}${v2.has(j.style) ? "✓" : ""}`).join(", ") || "nothing passes"} -> ${todo.length + emptyEdits} edits`);
    if (dry) continue;
    for (const legacy of ["startup", "clinic", "training"]) await retireStaged(ref.id, legacy);
    await pool().query("update media set is_current = false where unit_id = $1 and kind = 'staged' and style = 'empty' and not (meta ? 'space_id')", [ref.id]);
    for (const j of todo) {
      const t0 = Date.now();
      const url = await stageOne(ref, j);
      console.log(`  ${j.style}: ${Math.round((Date.now() - t0) / 1000)}s ${url}`);
    }
  }
  console.log(`${dry ? "DRY RUN — " : ""}image edits: ${edits} (~$${(edits * 0.01).toFixed(2)} at $0.01/image)`);
  await pool().end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
