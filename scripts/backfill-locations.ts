// Unit locations (plan/06 6.7 step 1).
//   pnpm backfill-locations [--dry]
//     seeded units without a location get district centres (location_approx = true)
//   pnpm backfill-locations --slug <slug> --at "<Maps link or lat, lng>" [--district "<text>"] [--dry]
//     pins one unit exactly (location_approx = false), e.g. a filmed unit's real building
import { pool } from "../lib/db/pg";
import { resolveLocation, SEED_DISTRICTS } from "../lib/geo";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

async function pinOne(slug: string, at: string, district: string | undefined, dry: boolean) {
  const p = await resolveLocation(at);
  if (!p) throw new Error(`could not read a location in Egypt from: ${at}`);
  console.log(`${dry ? "would pin" : "pinned"} ${slug} -> ${p.lat}, ${p.lng} (exact)${district ? `, district "${district}"` : ""}`);
  if (dry) return;
  const { rowCount } = await pool().query(
    "update units set lat = $2, lng = $3, location_approx = false, district = coalesce($4, district) where slug = $1",
    [slug, p.lat, p.lng, district ?? null]);
  if (!rowCount) throw new Error(`no unit ${slug}`);
}

async function backfill(dry: boolean) {
  const { rows } = await pool().query<{ slug: string }>("select slug from units where lat is null order by created_at");
  const missing = rows.filter((r) => !SEED_DISTRICTS[r.slug]).map((r) => r.slug);
  for (const r of rows) {
    const p = SEED_DISTRICTS[r.slug];
    if (!p) continue;
    console.log(`${dry ? "would set" : "set"} ${r.slug} -> ${p.lat}, ${p.lng} (approximate)`);
    if (!dry) await pool().query("update units set lat = $2, lng = $3, location_approx = true where slug = $1 and lat is null", [r.slug, p.lat, p.lng]);
  }
  if (missing.length) console.log(`no district coordinates for: ${missing.join(", ")}`);
}

async function main() {
  const dry = process.argv.includes("--dry");
  const slug = arg("--slug"), at = arg("--at");
  if (slug && at) await pinOne(slug, at, arg("--district"), dry);
  else await backfill(dry);
  await pool().end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
