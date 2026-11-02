// Booking add-ons: venue items for every unit, plus (daily bookings only) the
// menus of the unit's nearby chains from brand_menus (plan/06 6.7 step 6).
// Menu prices are copied from the elmenus import; ordering is fulfilled on the
// demo WhatsApp line (owner's number, CAFE_WHATSAPP_NUMBER).
import { nearbyOf } from "../nearby";

export interface AddonCatalogItem {
  id: string; name_ar: string; name_en: string; price_egp: number; source: "cafe" | "venue"; note_en: string;
  place?: { name: string; distance_m: number; brand: string; brand_ar: string | null; source_label: string | null };
}

export const CAFE = {
  // Owner's own WhatsApp line for the demo; E.164 without '+' e.g. 2010xxxxxxxx
  whatsapp: () => process.env.CAFE_WHATSAPP_NUMBER ?? "",
};

export const VENUE_ADDONS: AddonCatalogItem[] = [
  { id: "extra-chair", name_ar: "كرسي إضافي", name_en: "Extra chair", price_egp: 50, source: "venue", note_en: "Venue inventory, per day" },
  { id: "whiteboard", name_ar: "سبورة بيضاء", name_en: "Whiteboard + markers", price_egp: 100, source: "venue", note_en: "Venue inventory, per day" },
  { id: "printing-20", name_ar: "طباعة ٢٠ ورقة", name_en: "Printing (20 pages)", price_egp: 40, source: "venue", note_en: "Venue service, per booking" },
];

// Menu items of every matched nearby chain, then the venue items.
export async function addonsForUnit(unitId: string, daily: boolean): Promise<AddonCatalogItem[]> {
  if (!daily) return VENUE_ADDONS;
  const menu = (await nearbyOf(unitId)).filter((p) => p.brand).flatMap((p) => p.items.map((it): AddonCatalogItem => ({
    id: it.id, name_en: it.name_en, name_ar: it.name_ar, price_egp: it.price_egp, source: "cafe", note_en: `${it.size}, menu price EGP`,
    place: { name: p.name, distance_m: p.distance_m, brand: p.brand!, brand_ar: p.brand_ar, source_label: p.source_label },
  })));
  return [...menu, ...VENUE_ADDONS];
}

export function cafeWhatsAppUrl(lines: string[]): string | null {
  const num = CAFE.whatsapp().replace(/\D/g, "");
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(lines.join("\n"))}`;
}
