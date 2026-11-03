// Load data/seed/demo-snapshot.json (the 13 demo units) into any Postgres.
// Idempotent: units upsert by slug; specs, media and places are replaced; open
// availability is regenerated from today. One transaction: all or nothing.
// Uses DATABASE_URL (direct). Run after pnpm migrate: pnpm seed
// A non-local database needs --remote (seeding replaces the demo units' media rows).
// Nearby places: the snapshot keeps only place_id (Google Places terms), so names
// are null. With GOOGLE_PLACES_API_KEY set, each unit's places are refetched after
// the commit (same path as pnpm places-units, one Nearby Search per unit);
// --no-places skips that. A failed refetch keeps the seeded rows.
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { directUrl, isLocalDb, sslFor } from "../lib/db/pg";
import { pickPlaces, placesConfigured, searchNearby } from "../lib/places";
import { SNAPSHOT_PATH, seedSnapshot, validateSnapshot, type SeedResult } from "./seed-snapshot";

async function refetchPlaces(client: Client, units: SeedResult["located"]): Promise<number> {
  let ok = 0;
  for (const u of units) {
    try {
      const picked = pickPlaces(await searchNearby({ lat: u.lat, lng: u.lng }));
      await client.query("begin");
      await client.query("delete from unit_places where unit_id = $1", [u.id]);
      for (const p of picked)
        await client.query(
          "insert into unit_places (unit_id, place_id, name, primary_type, distance_m, maps_url) values ($1,$2,$3,$4,$5,$6)",
          [u.id, p.place_id, p.name, p.primary_type, p.distance_m, p.maps_url]);
      await client.query("commit");
      ok++;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log(`places ${u.slug}: kept seeded rows (${/^[A-Z0-9_]+/.exec((e as Error).message)?.[0] ?? "error"})`);
    }
  }
  return ok;
}

async function main() {
  const url = directUrl();
  if (!isLocalDb(url) && !process.argv.includes("--remote")) {
    throw new Error("DATABASE_URL is not a local Postgres; re-run with `pnpm seed --remote` if you really mean to seed it");
  }
  const snap = validateSnapshot(JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")));
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    let r: SeedResult;
    try {
      await client.query("begin");
      r = await seedSnapshot(client, snap);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    }
    console.log(`seed ok — ${r.units} units, ${r.media} media, ${r.places} places, +${r.slots} availability slots through ${r.until}`);
    if (process.argv.includes("--no-places")) return;
    if (!placesConfigured()) {
      console.log("nearby places: names not filled (GOOGLE_PLACES_API_KEY not set); units show distance and a Maps link only");
      return;
    }
    console.log(`nearby places refreshed for ${await refetchPlaces(client, r.located)}/${r.located.length} units`);
  } finally { await client.end(); }
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
