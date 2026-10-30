// XPay Hosted Checkout. Keys in env only, never the repo.
// Booking is confirmed ONLY on a signature-verified webhook (see webhook route).
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.xpay.app";

export function xpayConfig(): { secretKey: string } | null {
  const secretKey = process.env.XPAY_SECRET_KEY;
  if (!secretKey) return null;
  return { secretKey };
}

export function xpayWebhookSecret(): string {
  return process.env.XPAY_WEBHOOK_SECRET ?? "";
}

export async function createCheckoutSession(opts: {
  amountEgp: number; bookingId: string; locale?: "ar" | "en";
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const cfg = xpayConfig();
  if (!cfg) throw new Error("XPAY_NOT_CONFIGURED");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const body: Record<string, unknown> = {
    lineItems: [{
      priceData: {
        currency: "EGP",
        unitAmount: Math.round(opts.amountEgp * 100), // minor units
        productData: { name: `Offisio booking ${opts.bookingId}` },
      },
      quantity: 1,
    }],
    metadata: { booking_id: opts.bookingId },
    submitType: "BOOK",
  };
  if (appUrl) {
    body.afterCompletion = { type: "redirect", redirect: { url: `${appUrl}/${opts.locale ?? "en"}/booking/${opts.bookingId}` } };
  }
  const res = await fetch(`${BASE}/checkout/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.secretKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`XPay /checkout/sessions ${res.status}: ${text.slice(0, 400)}`);
  const data = JSON.parse(text) as { id?: string; url?: string };
  if (!data.url || !data.id) throw new Error("XPay session response missing id/url");
  return { checkoutUrl: data.url, sessionId: data.id };
}

// XPay-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>, 5-min replay window.
export function verifyXPaySignature(rawBody: string, header: string | null): boolean {
  const secret = xpayWebhookSecret();
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => {
    const i = p.indexOf("=");
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }));
  const timestamp = Number.parseInt(parts.t ?? "", 10);
  const received = parts.v1 ?? "";
  if (!Number.isFinite(timestamp) || !received) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;
  const computed = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(computed); const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface XPaySession {
  id: string; paymentStatus?: string; metadata?: Record<string, string>;
}

export function sessionFromEvent(event: Record<string, unknown>): XPaySession | null {
  const data = event.data as Record<string, unknown> | undefined;
  const obj = data?.object as Record<string, unknown> | undefined;
  if (!obj || typeof obj.id !== "string") return null;
  return {
    id: obj.id,
    paymentStatus: typeof obj.paymentStatus === "string" ? obj.paymentStatus : undefined,
    metadata: (obj.metadata as Record<string, string> | undefined) ?? {},
  };
}
