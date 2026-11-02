import { createBooking, attachCafeUrl, type AddonRequest, type CreateBookingInput } from "@/lib/booking";
import { getBooking } from "@/lib/db/store";
import { waLinkUrl } from "@/lib/whatsapp";
import { deny, limit } from "@/lib/guard";
export async function POST(req: Request) {
  const allowed = await limit("booking", req);
  if (!allowed.ok) return deny(allowed.code);
  try {
    // Web form fields only: wa_id and created_via are set by the WhatsApp channel, never by a caller.
    const b = (await req.json()) as Record<string, unknown>;
    const booking = await createBooking({
      unit_slug: String(b.unit_slug ?? ""), date: String(b.date ?? ""), track: b.track as CreateBookingInput["track"],
      renter_name: String(b.renter_name ?? ""), renter_phone: String(b.renter_phone ?? ""), renter_email: String(b.renter_email ?? ""),
      addons: Array.isArray(b.addons) ? (b.addons as AddonRequest[]).slice(0, 40) : [],
    });
    return Response.json({ booking }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const booking = await getBooking(id);
  if (!booking) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  // Never echo the WhatsApp id or email; say only whether updates are on, and offer the link while off.
  const { wa_id, renter_email: _email, ...pub } = attachCafeUrl(booking); // eslint-disable-line @typescript-eslint/no-unused-vars
  const active = ["awaiting_payment", "confirmed"].includes(booking.status);
  return Response.json({ booking: { ...pub, whatsapp_linked: Boolean(wa_id), whatsapp_link_url: !wa_id && active ? waLinkUrl(booking.id) : null } });
}
