import { verifyPaymobHmac, bookingRefFromWebhook, paymobOrderIdFromWebhook } from "@/lib/paymob";
import { confirmBooking, failBooking } from "@/lib/booking";
import { pool } from "@/lib/db/pg";

// Booking confirms ONLY here, on HMAC-verified Paymob callback — never on redirect.
export async function POST(req: Request) {
  const body = await req.json() as { obj?: Record<string, unknown>; hmac?: string; type?: string };
  const obj = body.obj ?? (body as Record<string, unknown>);
  const hmac = body.hmac ?? req.headers.get("hmac") ?? new URL(req.url).searchParams.get("hmac") ?? "";
  if (!verifyPaymobHmac(obj, hmac)) return Response.json({ error: "BAD_HMAC" }, { status: 401 });
  const success = obj.success === true || obj.success === "true";
  const orderId = paymobOrderIdFromWebhook(obj);
  let bookingId = bookingRefFromWebhook(obj);
  if (!bookingId && orderId) {
    const r = await pool().query<{ booking_id: string }>("select booking_id from payments where paymob_order_id = $1 or paymob_intention_id = $1 order by created_at desc limit 1", [orderId]);
    bookingId = r.rows[0]?.booking_id ?? "";
  }
  await pool().query("update payments set status = $1, raw = $2 where paymob_order_id = $3 or paymob_intention_id = $3 or booking_id = $4",
    [success ? "success" : "failed", JSON.stringify(obj), orderId, bookingId || null]);
  if (!bookingId) return Response.json({ ok: true, booking_id: "", status: "unmatched" });
  const booking = success ? await confirmBooking(bookingId) : await failBooking(bookingId);
  return Response.json({ ok: true, booking_id: bookingId, status: booking?.status ?? "unknown" });
}

export async function GET(req: Request) {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  const obj: Record<string, unknown> = { ...q, source_data: { pan: q["source_data.pan"] ?? "", sub_type: q["source_data.sub_type"] ?? "", type: q["source_data.type"] ?? "" }, order: q.order_id ?? q.order ?? "" };
  if (!verifyPaymobHmac(obj, q.hmac ?? "")) return Response.json({ error: "BAD_HMAC" }, { status: 401 });
  return Response.json({ ok: true });
}
