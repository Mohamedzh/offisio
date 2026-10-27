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
}
export interface Slot { id: string; unit_slug: string; date: string; starts_at: string; ends_at: string; is_booked: boolean }
export interface AddonItem { id: string; booking_id: string; item_id: string; name_en: string; name_ar: string; qty: number; unit_price_egp: number; deliver_at: string | null; status: "pending_cafe" | "sent_to_cafe" }
export type BookingStatus = "awaiting_payment" | "confirmed" | "payment_failed" | "cancelled";
export interface Booking {
  id: string; unit_slug: string; slot_ids: string[]; track: RentPeriod;
  renter_name: string; renter_phone: string; rent_egp_total: number;
  addons: AddonItem[]; total_egp: number; status: BookingStatus;
  payment_id: string | null; cafe_whatsapp_url: string | null; created_at: string;
}
export interface Payment { id: string; booking_id: string; provider: "paymob"; paymob_order_id: string | null; amount_cents: number; status: "pending" | "success" | "failed"; created_at: string }

interface UnitRow {
  slug: string; kind: Unit["kind"]; district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; available_from: string; rent_periods: RentPeriod[];
  title_ar: string; title_en: string; summary_ar: string; summary_en: string;
  highlights_ar: string[]; highlights_en: string[]; specs: Record<string, unknown> | null;
  media: { kind: string; style: string | null; url: string }[] | null;
}

function rowToUnit(r: UnitRow): Unit {
  const media = r.media ?? [];
  const byKind = (kind: string, style?: string) => media.find((m) => m.kind === kind && (style === undefined || m.style === style))?.url ?? null;
  return {
    slug: r.slug, kind: r.kind, district: r.district, rent_egp: r.rent_egp, floor_text: r.floor_text ?? "",
    available_from: r.available_from ? new Date(r.available_from).toISOString().slice(0, 10) : "",
    rent_periods: r.rent_periods ?? [], daily_egp: r.daily_egp,
    title_ar: r.title_ar ?? "", title_en: r.title_en ?? "", summary_ar: r.summary_ar ?? "", summary_en: r.summary_en ?? "",
    highlights_ar: r.highlights_ar ?? [], highlights_en: r.highlights_en ?? [], specs: r.specs ?? {},
    images: {
      real: byKind("keyframe") ?? "",
      empty: byKind("staged", "empty"),
      fits: { startup: byKind("staged", "startup") ?? "", clinic: byKind("staged", "clinic") ?? "", training: byKind("staged", "training") ?? "" },
    },
  };
}

const UNIT_SQL = `
  select u.slug, u.kind, u.district, u.rent_egp, u.daily_egp, u.floor_text, u.available_from,
         u.rent_periods, u.title_ar, u.title_en, u.summary_ar, u.summary_en, u.highlights_ar, u.highlights_en,
         s.data as specs,
         coalesce((select json_agg(json_build_object('kind', m.kind, 'style', m.style, 'url', m.url)) from media m where m.unit_id = u.id and m.is_current), '[]') as media
  from units u left join specs s on s.unit_id = u.id`;

export async function listUnits(): Promise<Unit[]> {
  const { rows } = await pool().query<UnitRow>(`${UNIT_SQL} order by u.created_at`);
  return rows.map(rowToUnit);
}
export async function getUnit(slug: string): Promise<Unit | null> {
  const { rows } = await pool().query<UnitRow>(`${UNIT_SQL} where u.slug = $1`, [slug]);
  return rows[0] ? rowToUnit(rows[0]) : null;
}
export async function unitId(slug: string): Promise<string | null> {
  const { rows } = await pool().query<{ id: string }>("select id from units where slug = $1", [slug]);
  return rows[0]?.id ?? null;
}

export async function availabilityByDay(unitSlug: string): Promise<{ date: string; total: number; free: number; day_free: boolean }[]> {
  const { rows } = await pool().query<{ date: string; total: string; free: string }>(
    `select (starts_at at time zone 'Africa/Cairo')::date::text as date, count(*)::text as total,
            count(*) filter (where not is_booked)::text as free
     from availability a join units u on u.id = a.unit_id
     where u.slug = $1 group by 1 order by 1`, [unitSlug]);
  return rows.map((r) => ({ date: r.date, total: Number(r.total), free: Number(r.free), day_free: Number(r.free) === Number(r.total) && Number(r.total) > 0 }));
}

export async function freeDates(): Promise<string[]> {
  const { rows } = await pool().query<{ date: string }>(
    `select distinct (starts_at at time zone 'Africa/Cairo')::date::text as date from availability where not is_booked order by 1 limit 7`);
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
