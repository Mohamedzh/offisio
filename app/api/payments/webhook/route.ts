import { verifyXPaySignature, sessionFromEvent } from "@/lib/xpay";
import { confirmBooking, failBooking } from "@/lib/booking";
import { pool } from "@/lib/db/pg";

// Booking confirms ONLY here, on a signature-verified XPay webhook — never on redirect.
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyXPaySignature(rawBody, req.headers.get("xpay-signature"))) {
    return Response.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  }
  const event = JSON.parse(rawBody) as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";
  const session = sessionFromEvent(event);
  if (!session) return Response.json({ ok: true, status: "no_session" });

  let bookingId = session.metadata?.booking_id ?? "";
  if (!bookingId) {
    const r = await pool().query<{ booking_id: string }>("select booking_id from payments where xpay_session_id = $1 order by created_at desc limit 1", [session.id]);
    bookingId = r.rows[0]?.booking_id ?? "";
  }
  const paid = session.paymentStatus === "paid" &&
    (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded");
  const failed = type === "checkout.session.async_payment_failed" ||
    (type === "checkout.session.completed" && session.paymentStatus === "payment_failed");
  await pool().query("update payments set status = $1, raw = $2 where xpay_session_id = $3",
    [paid ? "success" : failed ? "failed" : "pending", JSON.stringify(event), session.id]);
  if (!bookingId) return Response.json({ ok: true, booking_id: "", status: "unmatched" });
  if (paid) {
    const booking = await confirmBooking(bookingId);
    return Response.json({ ok: true, booking_id: bookingId, status: booking?.status ?? "unknown" });
  }
  if (failed) {
    const booking = await failBooking(bookingId);
    return Response.json({ ok: true, booking_id: bookingId, status: booking?.status ?? "unknown" });
  }
  return Response.json({ ok: true, booking_id: bookingId, status: "ignored" });
}
