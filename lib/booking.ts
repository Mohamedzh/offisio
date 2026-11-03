import { pool } from "./db/pg";
import { getUnit, unitId, getBooking, releaseStaleHolds, todayCairo, type Booking, type RentPeriod } from "./db/store";
import { addonsFor, isDailyOnlyAddon } from "./addons/catalog";
import { phoneFromWaId } from "./whatsapp";

export interface AddonRequest { item_id: string; qty: number; deliver_at?: string }
export interface CreateBookingInput {
  unit_slug: string; date: string; track?: RentPeriod;
  renter_name: string; renter_phone?: string; renter_email: string; addons?: AddonRequest[];
  created_via?: "chat" | "whatsapp";
  wa_id?: string; // WhatsApp sender: the phone comes from it, never from the chat text
}

const DELIVER_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const phone = input.wa_id ? phoneFromWaId(input.wa_id) : input.renter_phone?.replace(/\D/g, "") ?? "";
  if (!phone) throw new Error("INVALID_PHONE");
  // Typed numbers must be Egyptian mobiles; a WhatsApp number is already verified by Meta.
  if (!input.wa_id && !/^01[0125]\d{8}$/.test(phone)) throw new Error("INVALID_PHONE");
  const email = input.renter_email?.trim().toLowerCase() ?? "";
  if (!EMAIL.test(email)) throw new Error("INVALID_EMAIL");
  return insertBooking({ ...input, renter_phone: phone, renter_email: email });
}

async function insertBooking(input: CreateBookingInput & { renter_phone: string }): Promise<Booking> {
  if (!input.renter_name?.trim()) throw new Error("NAME_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) throw new Error("INVALID_DATE");
  if (input.date < todayCairo()) throw new Error("DATE_IN_PAST");
  await releaseStaleHolds();
  const unit = await getUnit(input.unit_slug);
  // Guest drafts are private until published: never bookable.
  if (!unit || unit.draft) throw new Error("UNIT_NOT_FOUND");
  const track: RentPeriod = input.track ?? unit.rent_periods[0];
  if (!unit.rent_periods.includes(track)) throw new Error("TRACK_NOT_AVAILABLE");
  const uId = await unitId(unit.slug);
  if (!uId) throw new Error("UNIT_NOT_FOUND");
  // Add-on prices come from the catalogue, never from the request; house food & drinks are daily-only.
  const catalog = addonsFor(track === "daily");

  const client = await pool().connect();
  try {
    await client.query("begin");
    let rent = 0; let slotIds: string[] = [];
    if (track === "daily") {
      if (!unit.daily_egp) throw new Error("TRACK_NOT_AVAILABLE");
      // Atomic day flip: all hourly slots of the day, or none (DESIGN §3 race rule).
      const day = await client.query<{ id: string; is_booked: boolean }>(
        `select id, is_booked from availability where unit_id = $1 and (starts_at at time zone 'Africa/Cairo')::date = $2::date for update`,
        [uId, input.date]);
      if (!day.rows.length || day.rows.some((s) => s.is_booked)) { await client.query("rollback"); throw new Error("SLOT_TAKEN"); }
      await client.query("update availability set is_booked = true where id = any($1::uuid[])", [day.rows.map((s) => s.id)]);
      rent = unit.daily_egp; slotIds = day.rows.map((s) => s.id);
    } else {
      rent = unit.rent_egp; // first month due at booking; longer reservation confirmed offline
    }
    const addons = (input.addons ?? []).map((a) => {
      const item = catalog.find((i) => i.id === a.item_id);
      if (!item) throw new Error(isDailyOnlyAddon(String(a.item_id)) && track !== "daily" ? "ADDON_DAILY_ONLY" : "ADDON_NOT_FOUND");
      return { item_id: item.id, name_en: item.name_en, name_ar: item.name_ar, qty: Math.min(20, Math.max(1, a.qty || 1)), unit_price_egp: item.price_egp, deliver_at: typeof a.deliver_at === "string" && DELIVER_AT.test(a.deliver_at) && !Number.isNaN(Date.parse(a.deliver_at)) ? a.deliver_at : null };
    });
    const total = rent + addons.reduce((s, a) => s + a.qty * a.unit_price_egp, 0);
    const ins = await client.query<{ id: string; created_at: string }>(
      `insert into bookings (unit_id, availability_ids, track, renter_name, renter_phone, renter_email, wa_id, rent_egp_total, total_egp, created_via)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, created_at`,
      [uId, slotIds, track, input.renter_name.trim(), input.renter_phone, input.renter_email, input.wa_id ?? null, rent, total, input.created_via ?? "chat"]);
    const bookingId = ins.rows[0].id;
    for (const a of addons)
      await client.query(
        `insert into booking_addons (booking_id, item_id, name_ar, name_en, qty, unit_price_egp, deliver_at) values ($1,$2,$3,$4,$5,$6,$7)`,
        [bookingId, a.item_id, a.name_ar, a.name_en, a.qty, a.unit_price_egp, a.deliver_at]);
    await client.query("commit");
    const booking = await getBooking(bookingId);
    if (!booking) throw new Error("BOOKING_CREATE_FAILED");
    return booking;
  } catch (e) {
    try { await client.query("rollback"); } catch { /* already rolled back */ }
    throw e;
  } finally { client.release(); }
}

// Paid webhook. A booking that expired (or failed) before the payment landed
// re-claims its slots atomically; if someone else took them meanwhile it is
// marked paid_conflict for a manual refund instead of double-booking.
export async function confirmBooking(bookingId: string): Promise<Booking | null> {
  const client = await pool().connect();
  let next = "";
  try {
    await client.query("begin");
    const cur = await client.query<{ status: string; availability_ids: string[] }>("select status, availability_ids from bookings where id = $1 for update", [bookingId]);
    const row = cur.rows[0];
    if (!row) { await client.query("rollback"); return null; }
    next = row.status;
    if (row.status === "awaiting_payment") next = "confirmed";
    else if (row.status === "expired" || row.status === "payment_failed") {
      const ids = row.availability_ids ?? [];
      await client.query("savepoint reclaim");
      const claimed = await client.query("update availability set is_booked = true where id = any($1::uuid[]) and not is_booked", [ids]);
      if ((claimed.rowCount ?? 0) === ids.length) next = "confirmed";
      else { await client.query("rollback to savepoint reclaim"); next = "paid_conflict"; }
    }
    if (next !== row.status) await client.query("update bookings set status = $2 where id = $1", [bookingId, next]);
    await client.query("commit");
  } catch (e) { try { await client.query("rollback"); } catch { /* noop */ } throw e; }
  finally { client.release(); }
  return getBooking(bookingId);
}

export async function failBooking(bookingId: string): Promise<Booking | null> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const cur = await client.query<{ status: string; availability_ids: string[] }>("select status, availability_ids from bookings where id = $1 for update", [bookingId]);
    if (!cur.rows.length) { await client.query("rollback"); return null; }
    // Only an unpaid booking still holds its slots; never release an expired
    // booking's days again (they may already belong to someone else).
    if (cur.rows[0].status === "awaiting_payment") {
      await client.query("update bookings set status = 'payment_failed' where id = $1", [bookingId]);
      await client.query("update availability set is_booked = false where id = any($1::uuid[])", [cur.rows[0].availability_ids]);
    }
    await client.query("commit");
  } catch (e) { try { await client.query("rollback"); } catch { /* noop */ } throw e; }
  finally { client.release(); }
  return getBooking(bookingId);
}
