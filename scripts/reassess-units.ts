// Re-run the rubric on every unit's stored survey after a rubric change (no
// survey call). The listing is regenerated only where the passing uses changed
// (one spark call each); otherwise only the specs row is updated.
// Run: pnpm reassess-units [--dry]
import { pool } from "../lib/db/pg";
import { getUnit, saveGenerated, unitRef } from "../lib/db/store";
import { assess, deriveSpecs, type UseVerdict } from "../lib/pipeline/rubric";
import { generateListingV2, type UploadOwner } from "../lib/pipeline/specs-listing";
import type { Survey } from "../lib/pipeline/survey";
import { withRentInTitles } from "./generate-units";

const passing = (us: UseVerdict[]) => JSON.stringify(us.filter((u) => u.verdict !== "not_suitable").map((u) => [u.use, u.verdict]));

async function main() {
  const dry = process.argv.includes("--dry");
  const { rows } = await pool().query<UploadOwner & { id: string; slug: string }>(
    "select id, slug, kind, district, rent_egp, daily_egp, floor_text, available_from::text from units where status = 'ready' order by created_at");
  let calls = 0;
  for (const { id, slug, ...owner } of rows) {
    const [unit, ref] = await Promise.all([getUnit(slug), unitRef(slug)]);
    const survey = unit?.specs.survey as Survey | undefined; const old = unit?.specs.uses as UseVerdict[] | undefined;
    if (!unit || !ref || !survey || !old) { console.log(`${slug}: no survey, skipped`); continue; }
    const uses = assess(survey, ref.kind);
    const specs = { ...deriveSpecs(survey, uses), survey, uses, survey_source: unit.specs.survey_source };
    const roles = (us: UseVerdict[]) => JSON.stringify(us.map((u) => u.roles));
    const changed = passing(old) !== passing(uses);
    console.log(`${slug}: ${changed ? "USES CHANGED -> new listing" : roles(old) !== roles(uses) ? "roles changed" : "same"} ${passing(uses)}`);
    if (dry) { calls += changed ? 1 : 0; continue; }
    if (changed) {
      calls++;
      const listing = await generateListingV2(specs, owner, uses);
      await saveGenerated(id, specs, unit.synthetic ? withRentInTitles(listing, owner.rent_egp) : listing);
    } else await pool().query("update specs set data = $2 where unit_id = $1", [id, JSON.stringify(specs)]);
  }
  console.log(`${dry ? "DRY RUN - " : ""}listing calls: ${calls}`);
  await pool().end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
