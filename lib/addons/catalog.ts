// Option A add-ons: curated cafe near the demo units + venue utils.
// Menu prices seeded from public Elmenus listings (EGP) — refreshable via
// Apify menu scraping; ordering is fulfilled on the cafe WhatsApp line.
export interface AddonCatalogItem { id: string; name_ar: string; name_en: string; price_egp: number; source: "cafe" | "venue"; note_en: string }

export const CAFE = {
  name: "Demo Cafe (public menu, placeholder partner)",
  // Owner's own WhatsApp line for the demo; E.164 without '+' e.g. 2010xxxxxxxx
  whatsapp: () => process.env.CAFE_WHATSAPP_NUMBER ?? "",
};

export const ADDON_CATALOG: AddonCatalogItem[] = [
  { id: "cappuccino", name_ar: "كابتشينو", name_en: "Cappuccino", price_egp: 65, source: "cafe", note_en: "Public cafe menu price, EGP" },
  { id: "espresso", name_ar: "اسبرسو", name_en: "Espresso", price_egp: 45, source: "cafe", note_en: "Public cafe menu price, EGP" },
  { id: "tea", name_ar: "شاي", name_en: "Tea", price_egp: 35, source: "cafe", note_en: "Public cafe menu price, EGP" },
  { id: "croissant", name_ar: "كرواسون", name_en: "Croissant", price_egp: 55, source: "cafe", note_en: "Public cafe menu price, EGP" },
  { id: "extra-chair", name_ar: "كرسي إضافي", name_en: "Extra chair", price_egp: 50, source: "venue", note_en: "Venue inventory, per day" },
  { id: "whiteboard", name_ar: "سبورة بيضاء", name_en: "Whiteboard + markers", price_egp: 100, source: "venue", note_en: "Venue inventory, per day" },
  { id: "printing-20", name_ar: "طباعة ٢٠ ورقة", name_en: "Printing (20 pages)", price_egp: 40, source: "venue", note_en: "Venue service, per booking" },
];

export function cafeWhatsAppUrl(lines: string[]): string | null {
  const num = CAFE.whatsapp().replace(/\D/g, "");
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(lines.join("\n"))}`;
}
