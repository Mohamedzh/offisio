// Booking add-ons, all provided by the venue (our own demo operator prices):
// venue items for every booking, plus house coffee & snacks on day bookings only.
// Prices live here and nowhere else; a booking never takes a price from the request.

export interface AddonCatalogItem {
  id: string; name_ar: string; name_en: string; price_egp: number; note_en: string;
  daily_only?: boolean; // food & drinks: only on a day booking
}

export const VENUE_ADDONS: AddonCatalogItem[] = [
  { id: "extra-chair", name_ar: "كرسي إضافي", name_en: "Extra chair", price_egp: 50, note_en: "Venue inventory, per day" },
  { id: "whiteboard", name_ar: "سبورة وأقلام", name_en: "Whiteboard + markers", price_egp: 100, note_en: "Venue inventory, per day" },
  { id: "printing-20", name_ar: "طباعة 20 ورقة", name_en: "Printing (20 pages)", price_egp: 40, note_en: "Venue service, per booking" },
];

export const HOUSE_ADDONS: AddonCatalogItem[] = [
  { id: "house-coffee", name_ar: "قهوة", name_en: "Coffee", price_egp: 40, note_en: "House coffee, per cup", daily_only: true },
  { id: "house-tea", name_ar: "شاي", name_en: "Tea", price_egp: 25, note_en: "Per cup", daily_only: true },
  { id: "house-water", name_ar: "مياه", name_en: "Water", price_egp: 15, note_en: "Per bottle", daily_only: true },
  { id: "house-croissant", name_ar: "كرواسون", name_en: "Croissant", price_egp: 45, note_en: "Per piece", daily_only: true },
  { id: "house-sandwich-tray", name_ar: "صينية ساندويتشات", name_en: "Sandwich tray", price_egp: 150, note_en: "Serves about 4", daily_only: true },
];

export const isDailyOnlyAddon = (id: string) => HOUSE_ADDONS.some((a) => a.id === id);

// House coffee & snacks (day bookings only), then the venue items.
export function addonsFor(daily: boolean): AddonCatalogItem[] {
  return daily ? [...HOUSE_ADDONS, ...VENUE_ADDONS] : VENUE_ADDONS;
}
