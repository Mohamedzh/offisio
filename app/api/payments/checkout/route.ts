import { createCheckoutSession, xpayConfig } from "@/lib/xpay";
import { pool } from "@/lib/db/pg";
import { getBooking, releaseStaleHolds } from "@/lib/db/store";
import { isLocale } from "@/lib/i18n";
export async function POST(req: Request) {
  const { booking_id, locale } = await req.json() as { booking_id: string; locale?: string };
  if (!xpayConfig()) {
    return Response.json({ error: "XPAY_NOT_CONFIGURED", setup: "Add XPAY_SECRET_KEY (sk_test_… from XPay dashboard > Developer > API Keys) and XPAY_WEBHOOK_SECRET (whsec_… from Developer > Webhooks) to .env.local and retry." }, { status: 503 });
  }
  await releaseStaleHolds();
  const b = await getBooking(booking_id);
  if (!b) return Response.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  if (b.status === "confirmed") return Response.json({ error: "ALREADY_CONFIRMED" }, { status: 409 });
  if (b.status !== "awaiting_payment") return Response.json({ error: "BOOKING_NOT_PAYABLE", status: b.status }, { status: 409 });
  try {
    const { checkoutUrl, sessionId } = await createCheckoutSession({ amountEgp: b.total_egp, bookingId: b.id, locale: isLocale(locale) ? locale : "en" });
    const pay = await pool().query<{ id: string }>(
      "insert into payments (booking_id, provider, xpay_session_id, amount_cents) values ($1,'xpay',$2,$3) returning id",
      [b.id, sessionId, b.total_egp * 100]);
    return Response.json({ checkout_url: checkoutUrl, payment_id: pay.rows[0].id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
