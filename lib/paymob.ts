// Paymob (Accept) test-mode integration. Keys in env only, never the repo.
// Booking is confirmed ONLY on an HMAC-verified callback (see webhook route).
import { createHmac } from "node:crypto";

const BASE = "https://accept.paymob.com";
export interface PaymobConfig { apiKey: string; integrationId: string; iframeId: string; hmacSecret: string }

export function paymobConfig(): PaymobConfig | null {
  const { PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID, PAYMOB_HMAC_SECRET } = process.env;
  if (!PAYMOB_API_KEY || !PAYMOB_INTEGRATION_ID || !PAYMOB_IFRAME_ID || !PAYMOB_HMAC_SECRET) return null;
  return { apiKey: PAYMOB_API_KEY, integrationId: PAYMOB_INTEGRATION_ID, iframeId: PAYMOB_IFRAME_ID, hmacSecret: PAYMOB_HMAC_SECRET };
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Paymob ${path} ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

export async function createCheckout(opts: {
  amountEgp: number; bookingId: string; email: string; firstName: string; phone: string;
}): Promise<{ iframeUrl: string; paymobOrderId: string }> {
  const cfg = paymobConfig();
  if (!cfg) throw new Error("PAYMOB_NOT_CONFIGURED");
  const auth = await post<{ token: string }>("/api/auth/tokens", { api_key: cfg.apiKey });
  const order = await post<{ id: number }>("/api/ecommerce/orders", {
    auth_token: auth.token, delivery_needed: "false", amount_cents: Math.round(opts.amountEgp * 100),
    currency: "EGP", merchant_order_id: opts.bookingId,
    items: [{ name: `Offisio booking ${opts.bookingId}`, amount_cents: Math.round(opts.amountEgp * 100), description: "Office rent + add-ons", quantity: 1 }],
  });
  const key = await post<{ token: string }>("/api/acceptance/payment_keys", {
    auth_token: auth.token, amount_cents: Math.round(opts.amountEgp * 100), expiration: 3600,
    order_id: order.id, currency: "EGP", integration_id: Number(cfg.integrationId),
    billing_data: { email: opts.email, first_name: opts.firstName || "Renter", last_name: "Offisio", phone_number: opts.phone, apartment: "NA", floor: "NA", street: "NA", building: "NA", city: "Cairo", country: "EG", state: "Cairo" },
  });
  return { iframeUrl: `${BASE}/api/acceptance/iframes/${cfg.iframeId}?payment_token=${key.token}`, paymobOrderId: String(order.id) };
}

// Paymob processed-callback HMAC: SHA512 over the ordered field set.
const HMAC_FIELDS = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order","owner","pending","source_data.pan","source_data.sub_type","source_data.type","success"] as const;

export function verifyPaymobHmac(obj: Record<string, unknown>, receivedHmac: string): boolean {
  const cfg = paymobConfig();
  if (!cfg) return false;
  const get = (k: string) => k.split(".").reduce<unknown>((a, p) => (a && typeof a === "object" ? (a as Record<string, unknown>)[p] : ""), obj) ?? "";
  const concat = HMAC_FIELDS.map((f) => String(get(f) ?? "")).join("");
  const calc = createHmac("sha512", cfg.hmacSecret).update(concat).digest("hex");
  return calc === receivedHmac;
}
