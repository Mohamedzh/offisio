// Nearby places for existing units (plan/06 6.7 step 4); new uploads get the same
// thing from the pipeline `places` step. One Places Nearby Search (Pro SKU) per unit.
//   pnpm places-units --dry          units, locations, call count and cost; no API calls
//   pnpm places-units [--only full,gen-zamalek]
import { pool } from "../lib/db/pg";
import { KEEP, RADIUS_M, refreshPlaces } from "../lib/places";

// Google list price for Nearby Search Pro (USD per 1000 calls, before the monthly free usage).
const PRO_PER_1000 = 32;
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const dry = process.argv.includes("--dry");
  const only = arg("--only")?.split(",").map((s) => s.trim());
  const { rows } = await pool().query<{ id: string; slug: string; lat: number | null; lng: number | null; location_approx: boolean }>(
    "select id, slug, lat::float as lat, lng::float as lng, location_approx from units where status = 'ready' order by created_at");
  const units = rows.filter((u) => !only || only.includes(u.slug));
  const located = units.filter((u) => u.lat !== null && u.lng !== null);
  for (const u of units.filter((x) => !located.includes(x))) console.log(`skip ${u.slug}: no location`);
  if (dry) {
    for (const u of located) console.log(`${u.slug}: ${u.lat}, ${u.lng}${u.location_approx ? " (approximate)" : " (exact)"}`);
    console.log(`\nwould make ${located.length} Places Nearby Search calls (Pro SKU, radius ${RADIUS_M} m, keep ${KEEP} per unit): ~$${(located.length * PRO_PER_1000 / 1000).toFixed(2)} at list price, before Google's monthly free usage`);
    await pool().end(); return;
  }
  let ok = 0;
  for (const u of located) {
    try {
      const picked = await refreshPlaces(u.id, { lat: u.lat!, lng: u.lng! });
      ok++;
      console.log(`${u.slug}: ${picked.length ? picked.map((p) => `${p.name} (${p.distance_m} m)`).join("; ") : "no cafes/restaurants within " + RADIUS_M + " m"}`);
    } catch (e) { console.log(`FAIL ${u.slug}: ${(e as Error).message}`); }
  }
  console.log(`\n${ok}/${located.length} units done`);
  await pool().end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
