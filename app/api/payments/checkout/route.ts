import { createCheckout, paymobConfig } from "@/lib/paymob";
import { pool } from "@/lib/db/pg";
import { getBooking } from "@/lib/db/store";
export async function POST(req: Request) {
  const { booking_id } = await req.json() as { booking_id: string };
  if (!paymobConfig()) {
    return Response.json({ error: "PAYMOB_NOT_CONFIGURED", setup: "Add PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID, PAYMOB_HMAC_SECRET to .env.local (Paymob dashboard, test mode) and retry." }, { status: 503 });
  }
  const b = await getBooking(booking_id);
  if (!b) return Response.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  if (b.status === "confirmed") return Response.json({ error: "ALREADY_CONFIRMED" }, { status: 409 });
  try {
    const { iframeUrl, paymobOrderId } = await createCheckout({ amountEgp: b.total_egp, bookingId: b.id, email: "renter@offisio.demo", firstName: b.renter_name.split(" ")[0], phone: b.renter_phone });
    const pay = await pool().query<{ id: string }>(
      "insert into payments (booking_id, paymob_order_id, amount_cents) values ($1,$2,$3) returning id",
      [b.id, paymobOrderId, b.total_egp * 100]);
    return Response.json({ iframe_url: iframeUrl, payment_id: pay.rows[0].id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
