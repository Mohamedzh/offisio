// Render use-driven fit-out concepts for units that have a survey (plan/06 6.6).
// --dry prints the plan and the number of image edits without calling a model.
// A real run retires legacy v1 renders (startup/clinic/training, unscoped empty).
// --redo=a,b re-renders those styles even if current (after a prompt change).
// Run: pnpm stage-units [slug] [--dry] [--redo=style,...]
import { pool } from "../lib/db/pg";
import { getUnit, stagedOf, unitRef, retireStaged } from "../lib/db/store";
import { isCurrent, planStaging, stageOne } from "../lib/pipeline/staging";
import { BRIEFS, targetUses } from "./generate-units";
import type { Survey } from "../lib/pipeline/survey";
import type { UseVerdict } from "../lib/pipeline/rubric";

async function main() {
  const dry = process.argv.includes("--dry");
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const redo = (process.argv.find((a) => a.startsWith("--redo="))?.slice(7) ?? "").split(",").filter(Boolean);
  const { rows } = await pool().query<{ slug: string }>("select slug from units where status = 'ready' order by created_at");
  let edits = 0;
  for (const { slug } of rows.filter((r) => !only || r.slug === only)) {
    const [ref, unit] = await Promise.all([unitRef(slug), getUnit(slug)]);
    const survey = unit?.specs.survey as Survey | undefined; const uses = unit?.specs.uses as UseVerdict[] | undefined;
    if (!ref || !survey || !uses) { console.log(`${slug}: no survey yet, skipped`); continue; }
    const brief = BRIEFS.find((b) => b.slug === slug);
    const jobs = planStaging(survey, uses, brief ? targetUses(brief) : undefined);
    const staged = await stagedOf(ref.id);
    const done = new Set(jobs.filter((j) => !redo.includes(j.style) && staged.some((m) => isCurrent(m, j))).map((j) => j.style));
    const emptied = new Set(staged.filter((m) => m.style === "empty" && m.meta.space_id).map((m) => String(m.meta.space_id)));
    const todo = jobs.filter((j) => !done.has(j.style));
    const emptyEdits = ref.kind === "furnished" ? new Set(todo.map((j) => j.spaceId).filter((s) => !emptied.has(s))).size : 0;
    edits += todo.length + emptyEdits;
    console.log(`${slug} (${ref.kind}): ${jobs.map((j) => `${j.style}@${j.spaceId}#${j.frame}${done.has(j.style) ? "✓" : ""}`).join(", ") || "nothing passes"} -> ${todo.length + emptyEdits} edits`);
    if (dry) continue;
    // Retire legacy v1 renders and any style the current plan no longer includes.
    const planned = new Set(jobs.map((j) => j.style));
    for (const style of new Set(["startup", "clinic", "training", ...staged.map((m) => m.style)]))
      if (style !== "empty" && !planned.has(style)) await retireStaged(ref.id, style);
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
