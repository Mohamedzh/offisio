// Paymob Unified Checkout (Intention API). Keys in env only, never the repo.
// Booking is confirmed ONLY on an HMAC-verified callback (see webhook route).
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://accept.paymob.com";
export interface PaymobConfig { secretKey: string; publicKey: string; hmacSecret: string; paymentMethods: (number | string)[] }

export function paymobConfig(): PaymobConfig | null {
  const secretKey = process.env.PAYMOB_SECRET_KEY;
  const publicKey = process.env.NEXT_PUBLIC_PAYMOB_PUBLIC_KEY || process.env.PAYMOB_PUBLIC_KEY;
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
  // Unified Checkout still requires existing payment integration(s) as
  // payment_methods (Developers > Payment Integrations); only iframe/API-key flow is gone.
  const raw = [process.env.PAYMOB_INTEGRATION_ID, process.env.PAYMOB_WALLET_INTEGRATION_ID].filter(Boolean) as string[];
  const paymentMethods = raw.map((v) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : v.trim()));
  if (!secretKey || !publicKey || !hmacSecret || paymentMethods.length === 0) return null;
  return { secretKey, publicKey, hmacSecret, paymentMethods };
}

export async function createCheckout(opts: {
  amountEgp: number; bookingId: string; email: string; firstName: string; phone: string;
}): Promise<{ checkoutUrl: string; intentionId: string; paymobOrderId: string }> {
  const cfg = paymobConfig();
  if (!cfg) throw new Error("PAYMOB_NOT_CONFIGURED");
  const amountCents = Math.round(opts.amountEgp * 100);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  const body: Record<string, unknown> = {
    amount: amountCents,
    currency: "EGP",
    payment_methods: cfg.paymentMethods,
    items: [{ name: `Offisio booking ${opts.bookingId}`, amount: amountCents, description: "Office rent + add-ons", quantity: 1 }],
    billing_data: {
      first_name: opts.firstName || "Renter", last_name: "Offisio",
      email: opts.email, phone_number: opts.phone,
      apartment: "NA", floor: "NA", street: "NA", building: "NA", city: "Cairo", country: "EG", state: "Cairo",
    },
    special_reference: opts.bookingId,
    extras: { booking_id: opts.bookingId },
  };
  if (appUrl) {
    body.notification_url = `${appUrl.replace(/\/$/, "")}/api/payments/webhook`;
    body.redirection_url = `${appUrl.replace(/\/$/, "")}/en/booking/${opts.bookingId}`;
  }
  const res = await fetch(`${BASE}/v1/intention/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${cfg.secretKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Paymob /v1/intention/ ${res.status}: ${text.slice(0, 400)}`);
  const data = JSON.parse(text) as { id?: string | number; client_secret?: string; intention_order_id?: string | number; order_id?: string | number };
  if (!data.client_secret) throw new Error("Paymob intention response missing client_secret");
  const intentionId = String(data.id ?? "");
  return {
    checkoutUrl: `${BASE}/unifiedcheckout/?publicKey=${encodeURIComponent(cfg.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`,
    intentionId,
    paymobOrderId: String(data.intention_order_id ?? data.order_id ?? intentionId),
  };
}

// Paymob processed-callback HMAC: SHA512 over the ordered field set (transaction webhooks,
// including Unified Checkout transactions, keep this shape).
const HMAC_FIELDS = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order","owner","pending","source_data.pan","source_data.sub_type","source_data.type","success"] as const;

export function verifyPaymobHmac(obj: Record<string, unknown>, receivedHmac: string): boolean {
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
  if (!hmacSecret || !receivedHmac) return false;
  const get = (k: string) => k.split(".").reduce<unknown>((a, p) => (a && typeof a === "object" ? (a as Record<string, unknown>)[p] : ""), obj) ?? "";
  const concat = HMAC_FIELDS.map((f) => String(get(f) ?? "")).join("");
  const calc = createHmac("sha512", hmacSecret).update(concat).digest("hex");
  const a = Buffer.from(calc); const b = Buffer.from(receivedHmac);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Booking reference from any Unified/transaction webhook shape.
export function bookingRefFromWebhook(obj: Record<string, unknown>): string {
  const order = (obj.order ?? {}) as Record<string, unknown> | number | string;
  const orderObj = typeof order === "object" ? order : {};
  for (const v of [obj.special_reference, obj.merchant_order_id, orderObj.merchant_order_id, orderObj.special_reference, (obj.extras as Record<string, unknown> | undefined)?.booking_id]) {
    if (typeof v === "string" && v) return v;
  }
  return "";
}

export function paymobOrderIdFromWebhook(obj: Record<string, unknown>): string {
  const order = obj.order as Record<string, unknown> | number | string | undefined;
  if (typeof order === "object" && order) return String(order.id ?? "");
  return order != null ? String(order) : "";
}
