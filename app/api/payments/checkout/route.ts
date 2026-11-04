import { createCheckoutSession, xpayConfig } from "@/lib/xpay";
import { pool } from "@/lib/db/pg";
import { getBooking, releaseStaleHolds } from "@/lib/db/store";
import { isLocale } from "@/lib/i18n";
import { deny, limit } from "@/lib/guard";
export async function POST(req: Request) {
  let body: { booking_id?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return Response.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  const booking_id = typeof body?.booking_id === "string" ? body.booking_id : "";
  const locale = typeof body?.locale === "string" ? body.locale : undefined;
  if (!booking_id) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (!xpayConfig()) {
    return Response.json({ error: "XPAY_NOT_CONFIGURED", setup: "Add XPAY_SECRET_KEY (sk_test_… from XPay dashboard > Developer > API Keys) and XPAY_WEBHOOK_SECRET (whsec_… from Developer > Webhooks) to .env.local and retry." }, { status: 503 });
  }
  await releaseStaleHolds();
  const b = await getBooking(booking_id);
  if (!b) return Response.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  if (b.status === "confirmed") return Response.json({ error: "ALREADY_CONFIRMED" }, { status: 409 });
  if (b.status !== "awaiting_payment") return Response.json({ error: "BOOKING_NOT_PAYABLE", status: b.status }, { status: 409 });
  // Counted only once an XPay session is about to open (each call creates one); cheap
  // not-found / not-payable answers above never use up a renter's retries.
  const allowed = await limit("checkout", req);
  if (!allowed.ok) return deny(allowed.code);
  try {
    const { checkoutUrl, sessionId } = await createCheckoutSession({ amountEgp: b.total_egp, bookingId: b.id, locale: isLocale(locale) ? locale : "en" });
    const pay = await pool().query<{ id: string }>(
      "insert into payments (booking_id, provider, xpay_session_id, amount_cents) values ($1,'xpay',$2,$3) returning id",
      [b.id, sessionId, b.total_egp * 100]);
    return Response.json({ checkout_url: checkoutUrl, payment_id: pay.rows[0].id });
  } catch (e) {
    // Only our fixed XPAY_* codes reach the client; anything else (DB, network) is logged.
    const msg = (e as Error).message;
    if (/^XPAY_[A-Z_0-9]+$/.test(msg)) return Response.json({ error: msg }, { status: 502 });
    console.error("[checkout] failed", (e as Error).name, msg.slice(0, 200));
    return Response.json({ error: "CHECKOUT_FAILED" }, { status: 502 });
  }
}
