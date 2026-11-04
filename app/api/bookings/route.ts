import { createBooking, type AddonRequest, type CreateBookingInput } from "@/lib/booking";
import { getBooking } from "@/lib/db/store";
import { waLinkUrl } from "@/lib/whatsapp";
import { deny, limit } from "@/lib/guard";
import { pool } from "@/lib/db/pg";
export async function POST(req: Request) {
  const allowed = await limit("booking", req);
  if (!allowed.ok) return deny(allowed.code);
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return Response.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  if (!b || typeof b !== "object") return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  try {
    // Web form fields only: wa_id and created_via are set by the WhatsApp channel, never by a caller.
    const booking = await createBooking({
      unit_slug: String(b.unit_slug ?? ""), date: String(b.date ?? ""), track: b.track as CreateBookingInput["track"],
      renter_name: String(b.renter_name ?? ""), renter_phone: String(b.renter_phone ?? ""), renter_email: String(b.renter_email ?? ""),
      addons: Array.isArray(b.addons) ? (b.addons as AddonRequest[]).slice(0, 40) : [],
    });
    return Response.json({ booking }, { status: 201 });
  } catch (e) {
    // Only our fixed codes (INVALID_PHONE, SLOT_TAKEN, ...) reach the client; DB/runtime errors are logged.
    const msg = (e as Error).message;
    if (/^[A-Z][A-Z_]+$/.test(msg)) return Response.json({ error: msg }, { status: 400 });
    console.error("[bookings] create failed", (e as Error).name, msg.slice(0, 200));
    return Response.json({ error: "BOOKING_CREATE_FAILED" }, { status: 500 });
  }
}
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const booking = await getBooking(id);
  if (!booking) return Response.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  // Anyone with the link can call this: no renter contact details (the page doesn't use them).
  // Say only whether WhatsApp updates are on, and offer the link while off.
  const { wa_id, renter_email: _email, renter_name: _name, renter_phone: _phone, ...pub } = booking; // eslint-disable-line @typescript-eslint/no-unused-vars
  const active = ["awaiting_payment", "confirmed"].includes(booking.status);
  // Latest payment's webhook-driven status only (pending|success|failed): lets the page stop
  // waiting after a declined card instead of polling until its timeout.
  const pay = booking.payment_id
    ? await pool().query<{ status: string }>("select status from payments where id = $1", [booking.payment_id])
    : null;
  const payment_status = pay?.rows[0]?.status ?? null;
  return Response.json({ booking: { ...pub, payment_status, whatsapp_linked: Boolean(wa_id), whatsapp_link_url: !wa_id && active ? waLinkUrl(booking.id) : null } });
}
