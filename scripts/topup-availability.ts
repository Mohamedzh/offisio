// Top up every unit's availability to availabilityUntil() and expire stale
// unpaid holds. Idempotent; safe to re-run. Run: pnpm topup-availability
import { pool } from "../lib/db/pg";
import { availabilityUntil, generateAvailability, releaseStaleHolds } from "../lib/db/store";

async function main() {
  const expired = await releaseStaleHolds();
  const { rows } = await pool().query<{ id: string; slug: string; available_from: string | null }>(
    "select id, slug, available_from::text from units order by created_at");
  for (const u of rows) {
    const added = await generateAvailability(u.id, u.available_from ?? "2026-10-27");
    console.log(`${u.slug}: +${added} slots`);
  }
  console.log(`topup ok — ${rows.length} units through ${availabilityUntil()}; expired holds: ${expired}`);
  await pool().end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
