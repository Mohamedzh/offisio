import { addonsForUnit, CAFE } from "@/lib/addons/catalog";
import { getUnit, unitId } from "@/lib/db/store";

// Add-ons for one unit's day booking: nearby chain menu items + venue items.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("unit") ?? "";
  const unit = slug ? await getUnit(slug) : null;
  const id = unit ? await unitId(unit.slug) : null;
  if (!unit || !id) return Response.json({ error: "UNIT_NOT_FOUND" }, { status: 404 });
  const items = await addonsForUnit(id, unit.rent_periods.includes("daily"));
  return Response.json({ whatsapp_configured: Boolean(CAFE.whatsapp()), items });
}
