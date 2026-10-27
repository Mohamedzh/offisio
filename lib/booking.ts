import { pool } from "./db/pg";
import { getUnit, unitId, getBooking, type Booking, type RentPeriod } from "./db/store";
import { ADDON_CATALOG, cafeWhatsAppUrl } from "./addons/catalog";

export interface AddonRequest { item_id: string; qty: number; deliver_at?: string }
export interface CreateBookingInput {
  unit_slug: string; date: string; track?: RentPeriod;
  renter_name: string; renter_phone: string; addons?: AddonRequest[];
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  if (!/^01[0125]\d{8}$/.test(input.renter_phone)) throw new Error("INVALID_PHONE"); // Egyptian mobile
  if (!input.renter_name?.trim()) throw new Error("NAME_REQUIRED");
  const unit = await getUnit(input.unit_slug);
  if (!unit) throw new Error("UNIT_NOT_FOUND");
  const track: RentPeriod = input.track ?? unit.rent_periods[0];
  if (!unit.rent_periods.includes(track)) throw new Error("TRACK_NOT_AVAILABLE");
  const uId = await unitId(unit.slug);
  if (!uId) throw new Error("UNIT_NOT_FOUND");

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
      const item = ADDON_CATALOG.find((i) => i.id === a.item_id);
      if (!item) throw new Error("ADDON_NOT_FOUND");
      return { item_id: item.id, name_en: item.name_en, name_ar: item.name_ar, qty: Math.max(1, a.qty || 1), unit_price_egp: item.price_egp, deliver_at: a.deliver_at ?? null };
    });
    const total = rent + addons.reduce((s, a) => s + a.qty * a.unit_price_egp, 0);
    const ins = await client.query<{ id: string; created_at: string }>(
      `insert into bookings (unit_id, availability_ids, track, renter_name, renter_phone, rent_egp_total, total_egp)
       values ($1,$2,$3,$4,$5,$6,$7) returning id, created_at`,
      [uId, slotIds, track, input.renter_name.trim(), input.renter_phone, rent, total]);
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

export function attachCafeUrl(b: Booking): Booking {
  if (b.status !== "confirmed") return b;
  const cafeItems = b.addons.filter((a) => ADDON_CATALOG.find((i) => i.id === a.item_id)?.source === "cafe");
  if (cafeItems.length) {
    b.cafe_whatsapp_url = cafeWhatsAppUrl([
      `New Offisio add-on order — booking ${b.id}`,
      `Unit: ${b.unit_slug} | Renter: ${b.renter_name} (${b.renter_phone})`,
      ...cafeItems.map((a) => `- ${a.qty} x ${a.name_en} @ EGP ${a.unit_price_egp}${a.deliver_at ? ` at ${a.deliver_at}` : ""}`),
      `Total add-ons: EGP ${cafeItems.reduce((s, a) => s + a.qty * a.unit_price_egp, 0)} (paid via Offisio/Paymob)`,
      "Please confirm prep time. Thank you!",
    ]);
  }
  return b;
}

export async function confirmBooking(bookingId: string): Promise<Booking | null> {
  await pool().query("update bookings set status = 'confirmed' where id = $1 and status <> 'confirmed'", [bookingId]);
  await pool().query(
    `update booking_addons set cafe_status = 'sent_to_cafe' where booking_id = $1 and item_id in (select id from (values ('cappuccino'),('espresso'),('tea'),('croissant')) as v(id))`,
    [bookingId]);
  const b = await getBooking(bookingId);
  return b ? attachCafeUrl(b) : null;
}

export async function failBooking(bookingId: string): Promise<Booking | null> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const cur = await client.query<{ status: string; availability_ids: string[] }>("select status, availability_ids from bookings where id = $1 for update", [bookingId]);
    if (!cur.rows.length) { await client.query("rollback"); return null; }
    if (cur.rows[0].status !== "confirmed") {
      await client.query("update bookings set status = 'payment_failed' where id = $1", [bookingId]);
      await client.query("update availability set is_booked = false where id = any($1::uuid[])", [cur.rows[0].availability_ids]);
    }
    await client.query("commit");
  } catch (e) { try { await client.query("rollback"); } catch { /* noop */ } throw e; }
  finally { client.release(); }
  return getBooking(bookingId);
}
