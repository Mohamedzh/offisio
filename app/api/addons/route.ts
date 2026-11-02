import { addonsFor } from "@/lib/addons/catalog";
import { getUnit } from "@/lib/db/store";

// Add-ons for one unit: house coffee & snacks (day-bookable units) + venue items.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("unit") ?? "";
  const unit = slug ? await getUnit(slug) : null;
  if (!unit) return Response.json({ error: "UNIT_NOT_FOUND" }, { status: 404 });
  return Response.json({ items: addonsFor(unit.rent_periods.includes("daily")) });
}
