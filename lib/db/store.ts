// Postgres-backed store (Neon). Pooled connection via lib/db/pg.ts.
// Schema: lib/db/schema.sql. Seed: scripts/seed.ts.
import { pool } from "./pg";

export type RentPeriod = "daily" | "monthly" | "long_term";
export interface Unit {
  slug: string; kind: "furnished" | "semifinished";
  district: string; rent_egp: number; floor_text: string; available_from: string;
  rent_periods: RentPeriod[]; daily_egp: number | null;
  title_ar: string; title_en: string; summary_ar: string; summary_en: string;
  highlights_ar: string[]; highlights_en: string[];
  specs: Record<string, unknown>;
  images: { real: string; empty: string | null; fits: Record<string, string> };
  video: string | null;
  synthetic: boolean;
}
export interface Slot { id: string; unit_slug: string; date: string; starts_at: string; ends_at: string; is_booked: boolean }
export interface AddonItem { id: string; booking_id: string; item_id: string; name_en: string; name_ar: string; qty: number; unit_price_egp: number; deliver_at: string | null; status: "pending_cafe" | "sent_to_cafe" }
export type BookingStatus = "awaiting_payment" | "confirmed" | "payment_failed" | "cancelled" | "expired" | "paid_conflict";
export interface Booking {
  id: string; unit_slug: string; slot_ids: string[]; track: RentPeriod;
  renter_name: string; renter_phone: string; rent_egp_total: number;
  addons: AddonItem[]; total_egp: number; status: BookingStatus;
  payment_id: string | null; cafe_whatsapp_url: string | null; created_at: string;
}
export interface Payment { id: string; booking_id: string; provider: "xpay"; xpay_session_id: string | null; amount_cents: number; status: "pending" | "success" | "failed"; created_at: string }

interface UnitRow {
  slug: string; kind: Unit["kind"]; district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; available_from: string; rent_periods: RentPeriod[];
  title_ar: string; title_en: string; summary_ar: string; summary_en: string;
  highlights_ar: string[]; highlights_en: string[]; specs: Record<string, unknown> | null;
  media: { kind: string; style: string | null; url: string; meta?: Record<string, unknown> }[] | null;
}

function rowToUnit(r: UnitRow): Unit {
  const media = r.media ?? [];
  // Legacy rows may still hold local /demo/... or /uploads/... paths next to
  // Blob rows for the same kind/style. Always prefer an https (Blob) URL.
  const pick = (list: UnitRow["media"]) =>
    list?.find((m) => m.url.startsWith("https://"))?.url ?? list?.find((m) => !m.url.startsWith("/"))?.url ?? list?.[0]?.url ?? null;
  const byKind = (kind: string, style?: string) =>
    pick(media.filter((m) => m.kind === kind && (style === undefined || m.style === style)));
  return {
    slug: r.slug, kind: r.kind, district: r.district, rent_egp: r.rent_egp, floor_text: r.floor_text ?? "",
    available_from: r.available_from ? new Date(r.available_from).toISOString().slice(0, 10) : "",
    rent_periods: r.rent_periods ?? [], daily_egp: r.daily_egp,
    title_ar: r.title_ar ?? "", title_en: r.title_en ?? "", summary_ar: r.summary_ar ?? "", summary_en: r.summary_en ?? "",
    highlights_ar: r.highlights_ar ?? [], highlights_en: r.highlights_en ?? [], specs: r.specs ?? {},
    images: {
      real: pick(media.filter((m) => m.kind === "keyframe" && m.meta?.hero === true)) ?? byKind("keyframe") ?? "",
      empty: byKind("staged", "empty"),
      fits: { startup: byKind("staged", "startup") ?? "", clinic: byKind("staged", "clinic") ?? "", training: byKind("staged", "training") ?? "" },
    },
    video: byKind("video"),
    synthetic: media.some((m) => m.meta?.synthetic === true),
  };
}

const UNIT_SQL = `
  select u.slug, u.kind, u.district, u.rent_egp, u.daily_egp, u.floor_text, u.available_from,
         u.rent_periods, u.title_ar, u.title_en, u.summary_ar, u.summary_en, u.highlights_ar, u.highlights_en,
         s.data as specs,
         coalesce((select json_agg(json_build_object('kind', m.kind, 'style', m.style, 'url', m.url, 'meta', m.meta) order by (m.url like 'https://%') desc, m.created_at desc) from media m where m.unit_id = u.id and m.is_current), '[]') as media
  from units u left join specs s on s.unit_id = u.id`;

export async function listUnits(): Promise<Unit[]> {
  const { rows } = await pool().query<UnitRow>(`${UNIT_SQL} where u.status = 'ready' order by u.created_at`);
  return rows.map(rowToUnit);
}

export interface CreateUploadedUnitInput {
  slug: string; kind: Unit["kind"]; district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; available_from: string; rent_periods: RentPeriod[];
}
export async function createUploadedUnit(input: CreateUploadedUnitInput): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `insert into units (slug, kind, status, district, rent_egp, daily_egp, floor_text, available_from, rent_periods)
     values ($1,$2,'processing',$3,$4,$5,$6,$7,$8) returning id`,
    [input.slug, input.kind, input.district, input.rent_egp, input.daily_egp, input.floor_text, input.available_from, input.rent_periods]);
  return rows[0].id;
}
export async function addMedia(unitId: string, kind: string, url: string, style: string | null = null, meta: Record<string, unknown> = {}): Promise<void> {
  await pool().query(`insert into media (unit_id, kind, style, url, meta) values ($1,$2,$3,$4,$5)`, [unitId, kind, style, url, JSON.stringify(meta)]);
}
export async function setUnitStatus(slug: string, status: "processing" | "ready" | "failed"): Promise<void> {
  await pool().query(`update units set status = $2 where slug = $1`, [slug, status]);
}
export interface GeneratedListing { title_ar: string; title_en: string; summary_ar: string; summary_en: string; highlights_ar: string[]; highlights_en: string[] }
export async function saveGenerated(unitId: string, specs: Record<string, unknown>, listing: GeneratedListing): Promise<void> {
  await pool().query(`insert into specs (unit_id, data, model) values ($1,$2,'muse-spark-1.3') on conflict (unit_id) do update set data = excluded.data, model = excluded.model`, [unitId, JSON.stringify(specs)]);
  await pool().query(
    `update units set title_ar = $2, title_en = $3, summary_ar = $4, summary_en = $5, highlights_ar = $6, highlights_en = $7 where id = $1`,
    [unitId, listing.title_ar, listing.title_en, listing.summary_ar, listing.summary_en, JSON.stringify(listing.highlights_ar), JSON.stringify(listing.highlights_en)]);
}
// Demo availability runs through judging (Nov 5–8) with margin.
export const AVAILABILITY_UNTIL = "2026-12-15";
export function todayCairo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
// Hourly slots 10:00–17:00 Cairo for every day from max(availableFrom, today) to AVAILABILITY_UNTIL.
// Idempotent: existing slots are kept as they are.
export async function generateAvailability(unitId: string, availableFrom: string): Promise<number> {
  const today = todayCairo();
  const start = availableFrom >= today ? availableFrom : today;
  const { rowCount } = await pool().query(
    `insert into availability (unit_id, starts_at, ends_at)
     select $1, (d::date + h * interval '1 hour') at time zone 'Africa/Cairo', (d::date + (h + 1) * interval '1 hour') at time zone 'Africa/Cairo'
     from generate_series($2::date, $3::date, interval '1 day') d, generate_series(10, 16) h
     on conflict (unit_id, starts_at) do nothing`,
    [unitId, start, AVAILABILITY_UNTIL]);
  return rowCount ?? 0;
}

const HOLD_MINUTES = () => Number(process.env.BOOKING_HOLD_MINUTES ?? 30);
// Unpaid bookings hold their day for HOLD_MINUTES, then expire and release it.
// Called lazily before availability reads and booking creation (no cron).
export async function releaseStaleHolds(): Promise<number> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string; availability_ids: string[] }>(
      `select id, availability_ids from bookings
       where status = 'awaiting_payment' and created_at < now() - make_interval(mins => $1::int)
       for update skip locked`, [HOLD_MINUTES()]);
    if (rows.length) {
      await client.query("update bookings set status = 'expired' where id = any($1::uuid[])", [rows.map((r) => r.id)]);
      await client.query("update availability set is_booked = false where id = any($1::uuid[])", [rows.flatMap((r) => r.availability_ids)]);
    }
    await client.query("commit");
    return rows.length;
  } catch (e) { try { await client.query("rollback"); } catch { /* noop */ } throw e; }
  finally { client.release(); }
}
export async function mergeUnitSpecs(slug: string, patch: Record<string, unknown>): Promise<boolean> {
  const { rowCount } = await pool().query(
    `update specs s set data = s.data || $2::jsonb || '{"owner_edited":true}'::jsonb from units u where s.unit_id = u.id and u.slug = $1`,
    [slug, JSON.stringify(patch)]);
  return (rowCount ?? 0) > 0;
}
export async function getUnit(slug: string): Promise<Unit | null> {
  const { rows } = await pool().query<UnitRow>(`${UNIT_SQL} where u.slug = $1`, [slug]);
  return rows[0] ? rowToUnit(rows[0]) : null;
}
export async function unitId(slug: string): Promise<string | null> {
  const { rows } = await pool().query<{ id: string }>("select id from units where slug = $1", [slug]);
  return rows[0]?.id ?? null;
}

// Days from today (Cairo) on; past days are never offered.
export async function availabilityByDay(unitSlug: string, limit = 45): Promise<{ date: string; total: number; free: number; day_free: boolean }[]> {
  await releaseStaleHolds();
  const { rows } = await pool().query<{ date: string; total: string; free: string }>(
    `select (starts_at at time zone 'Africa/Cairo')::date::text as date, count(*)::text as total,
            count(*) filter (where not is_booked)::text as free
     from availability a join units u on u.id = a.unit_id
     where u.slug = $1 and (starts_at at time zone 'Africa/Cairo')::date >= $2::date
     group by 1 order by 1 limit $3`, [unitSlug, todayCairo(), limit]);
  return rows.map((r) => ({ date: r.date, total: Number(r.total), free: Number(r.free), day_free: Number(r.free) === Number(r.total) && Number(r.total) > 0 }));
}

// Next n fully free days for one unit (what a daily booking needs).
export async function freeDays(unitSlug: string, n = 7): Promise<string[]> {
  return (await availabilityByDay(unitSlug)).filter((d) => d.day_free).slice(0, n).map((d) => d.date);
}

export async function freeDates(): Promise<string[]> {
  await releaseStaleHolds();
  const { rows } = await pool().query<{ date: string }>(
    `select distinct (starts_at at time zone 'Africa/Cairo')::date::text as date from availability
     where not is_booked and (starts_at at time zone 'Africa/Cairo')::date >= $1::date order by 1 limit 7`, [todayCairo()]);
  return rows.map((r) => r.date);
}

interface BookingRow {
  id: string; unit_slug: string; availability_ids: string[]; track: RentPeriod;
  renter_name: string; renter_phone: string; rent_egp_total: number; total_egp: number;
  status: BookingStatus; created_at: string;
  addons: (Omit<AddonItem, "booking_id" | "status"> & { cafe_status: string })[] | null;
}

function rowToBooking(r: BookingRow, paymentId: string | null, cafeUrl: string | null): Booking {
  return {
    id: r.id, unit_slug: r.unit_slug, slot_ids: r.availability_ids ?? [], track: r.track,
    renter_name: r.renter_name, renter_phone: r.renter_phone, rent_egp_total: r.rent_egp_total,
    addons: (r.addons ?? []).map((a) => ({ ...a, booking_id: r.id, status: (a.cafe_status === "sent_to_cafe" ? "sent_to_cafe" : "pending_cafe") as AddonItem["status"] })),
    total_egp: r.total_egp, status: r.status, payment_id: paymentId, cafe_whatsapp_url: cafeUrl,
    created_at: new Date(r.created_at).toISOString(),
  };
}

const BOOKING_SQL = `
  select b.id, u.slug as unit_slug, b.availability_ids, b.track, b.renter_name, b.renter_phone,
         b.rent_egp_total, b.total_egp, b.status, b.created_at,
         coalesce((select json_agg(json_build_object('id', a.id, 'item_id', a.item_id, 'name_en', a.name_en, 'name_ar', a.name_ar, 'qty', a.qty, 'unit_price_egp', a.unit_price_egp, 'deliver_at', a.deliver_at, 'cafe_status', a.cafe_status)) from booking_addons a where a.booking_id = b.id), '[]') as addons
  from bookings b join units u on u.id = b.unit_id`;

export async function getBooking(id: string): Promise<Booking | null> {
  const { rows } = await pool().query<BookingRow>(`${BOOKING_SQL} where b.id = $1`, [id]);
  if (!rows[0]) return null;
  const pay = await pool().query<{ id: string }>("select id from payments where booking_id = $1 order by created_at desc limit 1", [id]);
  // Cafe WhatsApp URL is derived at confirm time, not stored; recompute in booking service.
  return rowToBooking(rows[0], pay.rows[0]?.id ?? null, null);
}
