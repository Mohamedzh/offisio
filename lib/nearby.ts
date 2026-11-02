// Read side of nearby places (plan/06 6.7 step 6): a unit's stored places with
// their matched chain menu, for the unit page, booking add-ons and the agent.
// Prices come from brand_menus as imported (copied from source, never a model).
import { pool } from "./db/pg";
import type { MenuItem } from "./menus";

export interface NearbyMenuItem extends Pick<MenuItem, "name_en" | "name_ar" | "size" | "price_egp" | "category"> { id: string }
export interface Nearby {
  place_id: string; name: string; distance_m: number; maps_url: string;
  brand: string | null; brand_ar: string | null; kind: string | null;
  source_label: string | null; restaurant_url: string | null; items: NearbyMenuItem[];
}

// Add-on id for a menu item: "m:<brand>:<index in brand_menus.items>".
export const menuItemId = (brand: string, i: number) => `m:${brand}:${i}`;
export const isMenuItemId = (id: string) => id.startsWith("m:");

export async function nearbyOf(unitId: string): Promise<Nearby[]> {
  const { rows } = await pool().query<Omit<Nearby, "items"> & { items: MenuItem[] | null }>(
    `select p.place_id, p.name, p.distance_m, p.maps_url, p.brand, b.name_ar as brand_ar, b.kind,
            b.source_label, b.restaurant_url, b.items
       from unit_places p left join brand_menus b on b.brand = p.brand
      where p.unit_id = $1 order by p.distance_m`, [unitId]);
  return rows.map((r) => ({
    ...r,
    items: r.brand && r.items ? r.items.map((it, i) => ({ id: menuItemId(r.brand!, i), name_en: it.name_en, name_ar: it.name_ar, size: it.size, price_egp: it.price_egp, category: it.category })) : [],
  }));
}
