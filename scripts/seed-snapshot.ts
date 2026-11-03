// Shared by scripts/export-snapshot.ts and scripts/seed.ts: the snapshot shape,
// a deterministic JSON writer, and the loader (runs on a client the caller
// already holds inside a transaction).
import type { ClientBase } from "pg";
import { AVAILABILITY_UNTIL, todayCairo } from "../lib/db/store";
import { mapsUrlFor } from "../lib/places";

export const SNAPSHOT_PATH = "data/seed/demo-snapshot.json";
export const SNAPSHOT_VERSION = 1;
// Seeded availability always reaches at least this far past the seed day.
export const SEED_HORIZON_DAYS = 60;

export interface SnapshotUnit {
  slug: string; kind: "furnished" | "semifinished"; status: string; district: string;
  rent_egp: number; daily_egp: number | null; floor_text: string | null; available_from: string | null;
  rent_periods: string[]; title_ar: string | null; title_en: string | null;
  summary_ar: string | null; summary_en: string | null; highlights_ar: unknown; highlights_en: unknown;
  lat: number | null; lng: number | null; location_approx: boolean; created_at: string;
  specs: { data: Record<string, unknown>; model: string } | null;
  media: { kind: string; style: string | null; url: string; meta: Record<string, unknown>; created_at: string }[];
  // Google Places terms: only place_id may be stored long term, so no name/type/link here.
  // distance_m is ours (haversine from the unit). The Maps link is rebuilt from place_id.
  places: { place_id: string; distance_m: number }[];
}
export interface Snapshot { version: number; units: SnapshotUnit[] }

// Keys sorted at every level, arrays kept in order, 2-space indent, trailing newline.
export function stableJson(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") {
      return Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])]));
    }
    return x;
  };
  return `${JSON.stringify(sort(v), null, 2)}\n`;
}

export function validateSnapshot(raw: unknown): Snapshot {
  const s = raw as Snapshot;
  if (!s || s.version !== SNAPSHOT_VERSION || !Array.isArray(s.units)) throw new Error(`snapshot: expected version ${SNAPSHOT_VERSION} with units[]`);
  for (const u of s.units) {
    if (typeof u.slug !== "string" || !u.slug) throw new Error("snapshot: unit without slug");
    if (!Array.isArray(u.media) || !Array.isArray(u.places)) throw new Error(`snapshot: ${u.slug} media/places missing`);
  }
  return s;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Last seeded day: the app's AVAILABILITY_UNTIL or SEED_HORIZON_DAYS from today, whichever is later.
export function seedUntil(today: string = todayCairo()): string {
  const horizon = addDays(today, SEED_HORIZON_DAYS);
  return horizon > AVAILABILITY_UNTIL ? horizon : AVAILABILITY_UNTIL;
}

export interface SeedResult { units: number; media: number; places: number; slots: number; until: string;
  located: { id: string; slug: string; lat: number; lng: number }[] }

// Upsert every unit by slug and replace its specs, media and places with the
// snapshot's (places get a null name; scripts/seed.ts may refresh them).
// Availability: hourly 10:00-17:00 Cairo slots from max(available_from, today)
// to seedUntil(); existing slots (and bookings) are kept.
// Owner fields are cleared: seeded units belong to no one (lib/demo-units.ts).
export async function seedSnapshot(db: ClientBase, snap: Snapshot, today: string = todayCairo()): Promise<SeedResult> {
  const cols = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = current_schema() and table_name = 'units'");
  const has = new Set(cols.rows.map((r) => r.column_name));
  const ownerReset = ["owner_wa_id", "guest_owner"].filter((c) => has.has(c)).map((c) => `, ${c} = null`).join("");
  const until = seedUntil(today);
  const res: SeedResult = { units: 0, media: 0, places: 0, slots: 0, until, located: [] };

  for (const u of snap.units) {
    const { rows } = await db.query<{ id: string }>(
      `insert into units (slug, kind, status, district, rent_egp, daily_egp, floor_text, available_from, rent_periods,
                          title_ar, title_en, summary_ar, summary_en, highlights_ar, highlights_en, lat, lng, location_approx, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (slug) do update set kind = excluded.kind, status = excluded.status, district = excluded.district,
         rent_egp = excluded.rent_egp, daily_egp = excluded.daily_egp, floor_text = excluded.floor_text,
         available_from = excluded.available_from, rent_periods = excluded.rent_periods,
         title_ar = excluded.title_ar, title_en = excluded.title_en, summary_ar = excluded.summary_ar, summary_en = excluded.summary_en,
         highlights_ar = excluded.highlights_ar, highlights_en = excluded.highlights_en,
         lat = excluded.lat, lng = excluded.lng, location_approx = excluded.location_approx, created_at = excluded.created_at${ownerReset}
       returning id`,
      [u.slug, u.kind, u.status, u.district, u.rent_egp, u.daily_egp, u.floor_text, u.available_from, u.rent_periods,
        u.title_ar, u.title_en, u.summary_ar, u.summary_en, JSON.stringify(u.highlights_ar ?? []), JSON.stringify(u.highlights_en ?? []),
        u.lat, u.lng, u.location_approx, u.created_at]);
    const id = rows[0].id;
    res.units++;
    if (u.lat !== null && u.lng !== null) res.located.push({ id, slug: u.slug, lat: u.lat, lng: u.lng });

    if (u.specs) {
      await db.query(
        `insert into specs (unit_id, data, model) values ($1, $2, $3)
         on conflict (unit_id) do update set data = excluded.data, model = excluded.model`,
        [id, JSON.stringify(u.specs.data), u.specs.model]);
    } else {
      await db.query("delete from specs where unit_id = $1", [id]);
    }

    await db.query("delete from media where unit_id = $1", [id]);
    for (const m of u.media) {
      await db.query(
        "insert into media (unit_id, kind, style, url, is_current, meta, created_at) values ($1,$2,$3,$4,true,$5,$6)",
        [id, m.kind, m.style, m.url, JSON.stringify(m.meta ?? {}), m.created_at]);
      res.media++;
    }

    await db.query("delete from unit_places where unit_id = $1", [id]);
    for (const p of u.places) {
      await db.query(
        "insert into unit_places (unit_id, place_id, name, primary_type, distance_m, maps_url) values ($1,$2,null,null,$3,$4)",
        [id, p.place_id, p.distance_m, mapsUrlFor(p.place_id)]);
      res.places++;
    }

    const from = u.available_from && u.available_from > today ? u.available_from : today;
    const slots = await db.query(
      `insert into availability (unit_id, starts_at, ends_at)
       select $1, (d::date + h * interval '1 hour') at time zone 'Africa/Cairo', (d::date + (h + 1) * interval '1 hour') at time zone 'Africa/Cairo'
       from generate_series($2::date, $3::date, interval '1 day') d, generate_series(10, 16) h
       on conflict (unit_id, starts_at) do nothing`,
      [id, from, until]);
    res.slots += slots.rowCount ?? 0;
  }
  return res;
}
