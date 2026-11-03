// Export the seeded demo units (lib/demo-units.ts DEMO_UNIT_SLUGS) to
// data/seed/demo-snapshot.json so a fresh clone can run with `pnpm seed`
// instead of our Neon DB and paid regeneration. Read-only on the source DB.
// Only our own data and Meta-model output: units, specs, current media (public
// Blob URLs), nearby places as place_id + distance only (Google Places terms allow
// caching place_id; names are refetched on seed when a key is set). No bookings, payments, chat, usage, login rows,
// no owner numbers (owner_wa_id) or guest ids. Availability is not exported:
// pnpm seed regenerates it relative to the day it runs.
// Run: pnpm tsx scripts/export-snapshot.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pool } from "../lib/db/pg";
import { DEMO_UNIT_SLUGS } from "../lib/demo-units";
import { SNAPSHOT_PATH, SNAPSHOT_VERSION, stableJson, type Snapshot, type SnapshotUnit } from "./seed-snapshot";

async function main() {
  const db = pool();
  const { rows: units } = await db.query<Omit<SnapshotUnit, "specs" | "media" | "places"> & { id: string }>(
    `select id, slug, kind, status, district, rent_egp, daily_egp, floor_text, available_from::text as available_from,
            rent_periods, title_ar, title_en, summary_ar, summary_en, highlights_ar, highlights_en,
            lat::float as lat, lng::float as lng, location_approx, created_at
     from units where slug = any($1::text[])`, [DEMO_UNIT_SLUGS]);
  const missing = DEMO_UNIT_SLUGS.filter((s) => !units.some((u) => u.slug === s));
  if (missing.length) throw new Error(`demo units missing in source DB: ${missing.join(", ")}`);

  const out: SnapshotUnit[] = [];
  for (const slug of DEMO_UNIT_SLUGS) {
    const { id, ...u } = units.find((r) => r.slug === slug)!;
    const specs = await db.query<{ data: Record<string, unknown>; model: string }>(
      "select data, model from specs where unit_id = $1", [id]);
    const media = await db.query<SnapshotUnit["media"][number]>(
      `select kind, style, url, meta, created_at from media where unit_id = $1 and is_current
       order by kind, created_at, url`, [id]);
    const places = await db.query<SnapshotUnit["places"][number]>(
      `select place_id, distance_m from unit_places where unit_id = $1
       order by distance_m, place_id`, [id]);
    const local = media.rows.filter((m) => !/^https:\/\//.test(m.url));
    if (local.length) throw new Error(`${slug}: ${local.length} current media rows are not public URLs`);
    out.push({
      ...u,
      created_at: new Date(u.created_at).toISOString(),
      specs: specs.rows[0] ?? null,
      media: media.rows.map((m) => ({ ...m, created_at: new Date(m.created_at).toISOString() })),
      places: places.rows,
    });
  }

  const snap: Snapshot = { version: SNAPSHOT_VERSION, units: out };
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, stableJson(snap));
  const n = (k: "media" | "places") => out.reduce((a, u) => a + u[k].length, 0);
  console.log(`snapshot ok — ${out.length} units, ${n("media")} media, ${n("places")} places -> ${SNAPSHOT_PATH}`);
  await db.end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
