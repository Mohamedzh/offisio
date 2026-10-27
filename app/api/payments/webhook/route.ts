import { verifyPaymobHmac } from "@/lib/paymob";
import { confirmBooking, failBooking } from "@/lib/booking";
import { pool } from "@/lib/db/pg";

// Booking confirms ONLY here, on HMAC-verified Paymob callback — never on redirect.
export async function POST(req: Request) {
  const body = await req.json() as { obj?: Record<string, unknown>; hmac?: string };
  const obj = body.obj ?? {};
  const hmac = body.hmac ?? new URL(req.url).searchParams.get("hmac") ?? "";
  if (!verifyPaymobHmac(obj, hmac)) return Response.json({ error: "BAD_HMAC" }, { status: 401 });
  const order = (obj.order ?? {}) as Record<string, unknown>;
  const success = obj.success === true || obj.success === "true";
  await pool().query("update payments set status = $1, raw = $2 where paymob_order_id = $3",
    [success ? "success" : "failed", JSON.stringify(obj), String(order.id ?? "")]);
  const bookingId = String(order.merchant_order_id ?? "");
  const booking = success ? await confirmBooking(bookingId) : await failBooking(bookingId);
  return Response.json({ ok: true, booking_id: bookingId, status: booking?.status ?? "unknown" });
}

export async function GET(req: Request) {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  const obj: Record<string, unknown> = { ...q, source_data: { pan: q["source_data.pan"] ?? "", sub_type: q["source_data.sub_type"] ?? "", type: q["source_data.type"] ?? "" }, order: q.order_id ?? q.order ?? "" };
  if (!verifyPaymobHmac(obj, q.hmac ?? "")) return Response.json({ error: "BAD_HMAC" }, { status: 401 });
  return Response.json({ ok: true });
}
