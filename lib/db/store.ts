// Postgres-backed store (Neon). Pooled connection via lib/db/pg.ts.
// Schema: lib/db/schema.sql (pnpm migrate).
import { pool } from "./pg";

export type RentPeriod = "daily" | "monthly" | "long_term";
export interface Unit {
  slug: string; kind: "furnished" | "semifinished";
  district: string; rent_egp: number; floor_text: string; available_from: string;
  rent_periods: RentPeriod[]; daily_egp: number | null;
  title_ar: string; title_en: string; summary_ar: string; summary_en: string;
  highlights_ar: string[]; highlights_en: string[];
  specs: Record<string, unknown>;
  // staged: current fit-out renders, one per style (v2 use-driven, or legacy v1 startup/clinic/training).
  images: { real: string; empty: string | null; staged: { style: string; url: string }[] };
  video: string | null;
  synthetic: boolean;
  // Required for uploads; seeded units carry district centres (approx = true).
  location: { lat: number; lng: number; approx: boolean } | null;
  // Guest upload not yet published (guest_owner set, owner_wa_id null): not listed, not bookable.
  draft: boolean;
  status: "processing" | "ready" | "failed";
}
export interface Slot { id: string; unit_slug: string; date: string; starts_at: string; ends_at: string; is_booked: boolean }
export interface AddonItem { id: string; booking_id: string; item_id: string; name_en: string; name_ar: string; qty: number; unit_price_egp: number; deliver_at: string | null }
export type BookingStatus = "awaiting_payment" | "confirmed" | "payment_failed" | "cancelled" | "expired" | "paid_conflict";
export interface Booking {
  id: string; unit_slug: string; slot_ids: string[]; track: RentPeriod;
  renter_name: string; renter_phone: string; renter_email: string | null; wa_id: string | null; rent_egp_total: number;
  date: string | null; // Cairo day for daily bookings; null for monthly tracks
  addons: AddonItem[]; total_egp: number; status: BookingStatus;
  payment_id: string | null; created_at: string;
}
export interface Payment { id: string; booking_id: string; provider: "xpay"; xpay_session_id: string | null; amount_cents: number; status: "pending" | "success" | "failed"; created_at: string }

interface UnitRow {
  slug: string; kind: Unit["kind"]; district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; available_from: string; rent_periods: RentPeriod[];
  title_ar: string; title_en: string; summary_ar: string; summary_en: string;
  highlights_ar: string[]; highlights_en: string[]; specs: Record<string, unknown> | null;
  lat: string | null; lng: string | null; location_approx: boolean; draft: boolean; status: Unit["status"];
  media: { kind: string; style: string | null; url: string; meta?: Record<string, unknown> }[] | null;
}

// Viewer order of fit-out styles (lib/meta/prompts.ts STAGE_PROMPTS_V2, then legacy v1).
const STYLE_ORDER = ["office", "open_plan", "meeting", "clinic_waiting", "clinic_exam", "clinic_split", "dental_exam", "dental_prep", "legal_office", "startup", "clinic", "training"];
function rowToUnit(r: UnitRow): Unit {
  const media = r.media ?? [];
  // Legacy rows may still hold local /demo/... or /uploads/... paths next to
  // Blob rows for the same kind/style. Always prefer an https (Blob) URL.
  const pick = (list: UnitRow["media"]) =>
    list?.find((m) => m.url.startsWith("https://"))?.url ?? list?.find((m) => !m.url.startsWith("/"))?.url ?? list?.[0]?.url ?? null;
  const byKind = (kind: string, style?: string) =>
    pick(media.filter((m) => m.kind === kind && (style === undefined || m.style === style)));
  const heroSpaces = ((media.find((m) => m.kind === "keyframe" && m.meta?.hero === true)?.meta?.spaces as string[] | undefined) ?? []).map(String);
  return {
    slug: r.slug, kind: r.kind, district: r.district, rent_egp: r.rent_egp, floor_text: r.floor_text ?? "",
    available_from: r.available_from ? new Date(r.available_from).toISOString().slice(0, 10) : "",
    rent_periods: r.rent_periods ?? [], daily_egp: r.daily_egp,
    title_ar: r.title_ar ?? "", title_en: r.title_en ?? "", summary_ar: r.summary_ar ?? "", summary_en: r.summary_en ?? "",
    highlights_ar: r.highlights_ar ?? [], highlights_en: r.highlights_en ?? [], specs: r.specs ?? {},
    images: {
      real: pick(media.filter((m) => m.kind === "keyframe" && m.meta?.hero === true)) ?? byKind("keyframe") ?? "",
      // Empty of the hero's space when known, else the newest empty render.
      empty: pick(media.filter((m) => m.kind === "staged" && m.style === "empty" && heroSpaces.includes(String(m.meta?.space_id)))) ?? byKind("staged", "empty"),
      staged: [...new Set(media.filter((m) => m.kind === "staged" && m.style && m.style !== "empty").map((m) => m.style as string))]
        .sort((a, b) => STYLE_ORDER.indexOf(a) - STYLE_ORDER.indexOf(b))
        .map((style) => ({ style, url: byKind("staged", style) ?? "" })).filter((s) => s.url),
    },
    video: byKind("video"),
    synthetic: media.some((m) => m.meta?.synthetic === true),
    location: r.lat !== null && r.lng !== null ? { lat: Number(r.lat), lng: Number(r.lng), approx: r.location_approx } : null,
    draft: r.draft === true, status: r.status,
  };
}

// Guest drafts are reachable by direct link only (lib/owner guest id).
const DRAFT = "(u.guest_owner is not null and u.owner_wa_id is null)";
const UNIT_SQL = `
  select u.slug, u.kind, u.district, u.rent_egp, u.daily_egp, u.floor_text, u.available_from,
         u.rent_periods, u.title_ar, u.title_en, u.summary_ar, u.summary_en, u.highlights_ar, u.highlights_en,
         u.lat, u.lng, u.location_approx, s.data as specs, ${DRAFT} as draft, u.status,
         coalesce((select json_agg(json_build_object('kind', m.kind, 'style', m.style, 'url', m.url, 'meta', m.meta) order by (m.url like 'https://%') desc, m.created_at desc) from media m where m.unit_id = u.id and m.is_current), '[]') as media
  from units u left join specs s on s.unit_id = u.id`;

export async function listUnits(): Promise<Unit[]> {
  const { rows } = await pool().query<UnitRow>(`${UNIT_SQL} where u.status = 'ready' and not ${DRAFT} order by u.created_at`);
  return rows.map(rowToUnit);
}

export interface CreateUploadedUnitInput {
  slug: string; kind: Unit["kind"]; district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; available_from: string; rent_periods: RentPeriod[]; lat: number; lng: number; location_approx?: boolean;
  owner_wa_id?: string | null; // signed-in owner (PII); null for seeded/generated units
  guest_owner?: string | null; // guest upload (random browser id, not PII): the unit is a draft
}
export async function createUploadedUnit(input: CreateUploadedUnitInput): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `insert into units (slug, kind, status, district, rent_egp, daily_egp, floor_text, available_from, rent_periods, lat, lng, location_approx, owner_wa_id, guest_owner)
     values ($1,$2,'processing',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [input.slug, input.kind, input.district, input.rent_egp, input.daily_egp, input.floor_text, input.available_from, input.rent_periods, input.lat, input.lng, input.location_approx ?? false, input.owner_wa_id ?? null, input.guest_owner ?? null]);
  return rows[0].id;
}
export async function addMedia(unitId: string, kind: string, url: string, style: string | null = null, meta: Record<string, unknown> = {}): Promise<void> {
  await pool().query(`insert into media (unit_id, kind, style, url, meta) values ($1,$2,$3,$4,$5)`, [unitId, kind, style, url, JSON.stringify(meta)]);
}
// Retire the unit's current keyframes and insert a new set (re-runnable analysis).
export async function replaceKeyframes(unitId: string, frames: { url: string; meta: Record<string, unknown> }[]): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("update media set is_current = false where unit_id = $1 and kind = 'keyframe'", [unitId]);
    for (const f of frames)
      await client.query("insert into media (unit_id, kind, url, meta) values ($1, 'keyframe', $2, $3)", [unitId, f.url, JSON.stringify(f.meta)]);
    await client.query("commit");
  } catch (e) { try { await client.query("rollback"); } catch { /* noop */ } throw e; }
  finally { client.release(); }
}
export async function keyframesOf(unitId: string): Promise<{ url: string; frame: number }[]> {
  const { rows } = await pool().query<{ url: string; frame: string | null }>(
    "select url, meta->>'frame' as frame from media where unit_id = $1 and kind = 'keyframe' and is_current order by created_at", [unitId]);
  return rows.map((r, i) => ({ url: r.url, frame: r.frame === null ? i : Number(r.frame) }));
}
export async function stagedOf(unitId: string): Promise<{ style: string; url: string; meta: Record<string, unknown> }[]> {
  const { rows } = await pool().query<{ style: string; url: string; meta: Record<string, unknown> }>(
    "select style, url, meta from media where unit_id = $1 and kind = 'staged' and is_current order by created_at desc", [unitId]);
  return rows;
}
export async function retireStaged(unitId: string, style: string): Promise<void> {
  await pool().query("update media set is_current = false where unit_id = $1 and kind = 'staged' and style = $2", [unitId, style]);
}
export async function unitRef(slug: string): Promise<{ id: string; slug: string; kind: Unit["kind"] } | null> {
  const { rows } = await pool().query<{ id: string; slug: string; kind: Unit["kind"] }>("select id, slug, kind from units where slug = $1", [slug]);
  return rows[0] ?? null;
}
export async function setUnitStatus(slug: string, status: "processing" | "ready" | "failed"): Promise<void> {
  await pool().query(`update units set status = $2 where slug = $1`, [slug, status]);
}
export interface GeneratedListing { title_ar: string; title_en: string; summary_ar: string; summary_en: string; highlights_ar: string[]; highlights_en: string[] }
export async function saveGenerated(unitId: string, specs: Record<string, unknown>, listing: GeneratedListing): Promise<void> {
  await saveSpecs(unitId, specs);
  await saveListing(unitId, listing);
}
export async function saveSpecs(unitId: string, specs: Record<string, unknown>): Promise<void> {
  await pool().query(`insert into specs (unit_id, data, model) values ($1,$2,'muse-spark-1.3') on conflict (unit_id) do update set data = excluded.data, model = excluded.model`, [unitId, JSON.stringify(specs)]);
}
export async function saveListing(unitId: string, listing: GeneratedListing): Promise<void> {
  await pool().query(
    `update units set title_ar = $2, title_en = $3, summary_ar = $4, summary_en = $5, highlights_ar = $6, highlights_en = $7 where id = $1`,
    [unitId, listing.title_ar, listing.title_en, listing.summary_ar, listing.summary_en, JSON.stringify(listing.highlights_ar), JSON.stringify(listing.highlights_en)]);
}
// Demo availability runs through judging (Nov 5–8) with margin.
export const AVAILABILITY_UNTIL = "2026-12-15";
export function todayCairo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
// Current hour (0-23) in Cairo.
export function cairoHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23" }).format(now));
}
// Daily slots run 10:00-17:00; after 16:00 today's day pass can't be used, so it is not offered or bookable.
export const DAY_CUTOFF_HOUR = 16;
// First Cairo day still bookable: today, or tomorrow once today's cutoff has passed.
export function firstBookableDay(now = new Date()): string {
  // Day and hour from the same instant, so a call at Cairo midnight can't mix two days.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (cairoHour(now) < DAY_CUTOFF_HOUR) return today;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// Last generated day: AVAILABILITY_UNTIL, or AVAILABILITY_HORIZON_DAYS from today if later
// (uploads after the demo window still get slots).
export const AVAILABILITY_HORIZON_DAYS = 60;
export function availabilityUntil(today: string = todayCairo()): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + AVAILABILITY_HORIZON_DAYS);
  const horizon = d.toISOString().slice(0, 10);
  return horizon > AVAILABILITY_UNTIL ? horizon : AVAILABILITY_UNTIL;
}
// Hourly slots 10:00–17:00 Cairo for every day from max(availableFrom, today) to availabilityUntil().
// Idempotent: existing slots are kept as they are.
export async function generateAvailability(unitId: string, availableFrom: string): Promise<number> {
  const today = todayCairo();
  const start = availableFrom >= today ? availableFrom : today;
  const { rowCount } = await pool().query(
    `insert into availability (unit_id, starts_at, ends_at)
     select $1, (d::date + h * interval '1 hour') at time zone 'Africa/Cairo', (d::date + (h + 1) * interval '1 hour') at time zone 'Africa/Cairo'
     from generate_series($2::date, $3::date, interval '1 day') d, generate_series(10, 16) h
     on conflict (unit_id, starts_at) do nothing`,
    [unitId, start, availabilityUntil(today)]);
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

// Days from today (Cairo) on; past days, and today after the cutoff hour, are never offered.
export async function availabilityByDay(unitSlug: string, limit = 45): Promise<{ date: string; total: number; free: number; day_free: boolean }[]> {
  await releaseStaleHolds();
  const { rows } = await pool().query<{ date: string; total: string; free: string }>(
    `select (starts_at at time zone 'Africa/Cairo')::date::text as date, count(*)::text as total,
            count(*) filter (where not is_booked)::text as free
     from availability a join units u on u.id = a.unit_id
     where u.slug = $1 and (starts_at at time zone 'Africa/Cairo')::date >= $2::date
     group by 1 order by 1 limit $3`, [unitSlug, firstBookableDay(), limit]);
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
     where not is_booked and (starts_at at time zone 'Africa/Cairo')::date >= $1::date order by 1 limit 7`, [firstBookableDay()]);
  return rows.map((r) => r.date);
}

interface BookingRow {
  id: string; unit_slug: string; availability_ids: string[]; track: RentPeriod;
  renter_name: string; renter_phone: string; renter_email: string | null; wa_id: string | null; rent_egp_total: number; total_egp: number;
  status: BookingStatus; created_at: string; date: string | null;
  addons: Omit<AddonItem, "booking_id">[] | null;
}

function rowToBooking(r: BookingRow, paymentId: string | null): Booking {
  return {
    id: r.id, unit_slug: r.unit_slug, slot_ids: r.availability_ids ?? [], track: r.track,
    renter_name: r.renter_name, renter_phone: r.renter_phone, renter_email: r.renter_email, wa_id: r.wa_id, rent_egp_total: r.rent_egp_total,
    date: r.date,
    addons: (r.addons ?? []).map((a) => ({ ...a, booking_id: r.id })),
    total_egp: r.total_egp, status: r.status, payment_id: paymentId,
    created_at: new Date(r.created_at).toISOString(),
  };
}

const BOOKING_SQL = `
  select b.id, u.slug as unit_slug, b.availability_ids, b.track, b.renter_name, b.renter_phone, b.renter_email, b.wa_id,
         b.rent_egp_total, b.total_egp, b.status, b.created_at,
         (select min(s.starts_at at time zone 'Africa/Cairo')::date::text from availability s where s.id = any(b.availability_ids)) as date,
         coalesce((select json_agg(json_build_object('id', a.id, 'item_id', a.item_id, 'name_en', a.name_en, 'name_ar', a.name_ar, 'qty', a.qty, 'unit_price_egp', a.unit_price_egp, 'deliver_at', a.deliver_at)) from booking_addons a where a.booking_id = b.id), '[]') as addons
  from bookings b join units u on u.id = b.unit_id`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function getBooking(id: string): Promise<Booking | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null; // malformed id is "not found", not a pg error
  const { rows } = await pool().query<BookingRow>(`${BOOKING_SQL} where b.id = $1`, [id]);
  if (!rows[0]) return null;
  const pay = await pool().query<{ id: string }>("select id from payments where booking_id = $1 order by created_at desc limit 1", [id]);
  return rowToBooking(rows[0], pay.rows[0]?.id ?? null);
}

// A WhatsApp sender's bookings (6.8): matched by wa_id, or by the Egyptian mobile
// derived from it (web bookings made with the same number). Newest first. Expired and
// failed holds are left out so they never push real bookings past the limit; they are
// only counted (hiddenHoldsForRenter).
const RENTER_WHERE = "(b.wa_id = $1 or ($2::text is not null and b.renter_phone = $2))";
const HIDDEN_STATUSES = "('expired', 'payment_failed')";
export async function bookingsForRenter(waId: string, phone: string | null, limit = 10): Promise<Booking[]> {
  await releaseStaleHolds();
  const { rows } = await pool().query<BookingRow>(
    `${BOOKING_SQL} where ${RENTER_WHERE} and b.status not in ${HIDDEN_STATUSES} order by b.created_at desc limit $3`, [waId, phone, limit]);
  return rows.map((r) => rowToBooking(r, null));
}
export async function hiddenHoldsForRenter(waId: string, phone: string | null): Promise<number> {
  const { rows } = await pool().query<{ n: number }>(
    `select count(*)::int as n from bookings b where ${RENTER_WHERE} and b.status in ${HIDDEN_STATUSES}`, [waId, phone]);
  return rows[0]?.n ?? 0;
}

// Link a website booking to the WhatsApp sender who sent its signed code (6.8).
// Candidates share the 8-char ref; the caller checks the code against each full id.
export async function bookingIdsByRef(ref: string): Promise<{ id: string; wa_id: string | null }[]> {
  const { rows } = await pool().query<{ id: string; wa_id: string | null }>(
    "select id, wa_id from bookings where id::text like $1 order by created_at desc limit 5", [`${ref}%`]);
  return rows;
}
export async function setBookingWaId(id: string, waId: string): Promise<void> {
  await pool().query("update bookings set wa_id = $2 where id = $1 and (wa_id is null or wa_id = $2)", [id, waId]);
}

// Pipeline jobs (plan/06 6.7 step 2). One row per (unit, step); see lib/pipeline/jobs.ts.
export type JobStatus = "queued" | "running" | "done" | "failed";
export interface Job { step: string; status: JobStatus; attempts: number; last_error: string | null; updated_at: string }
export async function queueJobs(unitId: string, steps: string[]): Promise<void> {
  if (!steps.length) return;
  await pool().query(
    `insert into pipeline_jobs (unit_id, step) select $1, unnest($2::text[])
     on conflict (unit_id, step) do update set status = 'queued', attempts = 0, last_error = null, updated_at = now()`, [unitId, steps]);
}
// Atomic claim: queued, failed (a QStash retry) or stuck running. Null = already done or in progress.
const STUCK_MINUTES = 6;
export async function claimJob(unitId: string, step: string): Promise<number | null> {
  const { rows } = await pool().query<{ attempts: number }>(
    `update pipeline_jobs set status = 'running', attempts = attempts + 1, updated_at = now()
     where unit_id = $1 and step = $2
       and (status in ('queued','failed') or (status = 'running' and updated_at < now() - make_interval(mins => $3::int)))
     returning attempts`, [unitId, step, STUCK_MINUTES]);
  return rows[0]?.attempts ?? null;
}
// `finalAt` > 0 marks a failure no retry follows (permanent): attempts is raised to it so
// pipelineSettled does not wait for a QStash retry that never comes.
export async function finishJob(unitId: string, step: string, error: string | null = null, finalAt = 0): Promise<void> {
  await pool().query(
    "update pipeline_jobs set status = $3, last_error = $4, attempts = greatest(attempts, $5::int), updated_at = now() where unit_id = $1 and step = $2",
    [unitId, step, error === null ? "done" : "failed", error === null ? null : error.slice(0, 500), finalAt]);
}
// Listing live (unit ready) and no step left queued or running, nor failed with a QStash
// retry still coming (attempts below `maxDeliveries`; 0 locally, where a failure is final).
// Used to tell a WhatsApp owner once everything is in.
export async function pipelineSettled(unitId: string, maxDeliveries = 0): Promise<boolean> {
  const { rows } = await pool().query<{ ok: boolean }>(
    `select u.status = 'ready' and not exists (select 1 from pipeline_jobs j where j.unit_id = u.id
       and (j.status in ('queued','running') or (j.status = 'failed' and j.attempts < $2::int))) as ok
     from units u where u.id = $1`, [unitId, maxDeliveries]);
  return rows[0]?.ok === true;
}
export async function jobsOf(unitId: string): Promise<Job[]> {
  const { rows } = await pool().query<Job>(
    "select step, status, attempts, last_error, updated_at from pipeline_jobs where unit_id = $1 order by updated_at", [unitId]);
  return rows.map((r) => ({ ...r, updated_at: new Date(r.updated_at).toISOString() }));
}
// What the analyze/listing steps need: owner fields and keyframes with timestamps.
export interface UploadInputs {
  id: string; slug: string; kind: Unit["kind"]; district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; available_from: string; frames: { url: string; t: number }[]; specs: Record<string, unknown> | null;
  lat: number | null; lng: number | null;
}
export async function uploadInputs(slug: string): Promise<UploadInputs | null> {
  const { rows } = await pool().query<Omit<UploadInputs, "frames"> & { frames: { url: string; t: number | null }[] | null }>(
    `select u.id, u.slug, u.kind, u.district, u.rent_egp, u.daily_egp, u.floor_text, u.available_from::text as available_from, s.data as specs, u.lat::float as lat, u.lng::float as lng,
            (select json_agg(json_build_object('url', m.url, 't', (m.meta->>'t')::float) order by (m.meta->>'frame')::int nulls last, m.created_at)
             from media m where m.unit_id = u.id and m.kind = 'keyframe' and m.is_current) as frames
     from units u left join specs s on s.unit_id = u.id where u.slug = $1`, [slug]);
  const r = rows[0];
  return r ? { ...r, frames: (r.frames ?? []).map((f, i) => ({ url: f.url, t: f.t ?? i })) } : null;
}
