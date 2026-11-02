// Landmarks for the agent's "near X" search (plan/06 6.7 step 6). Approximate
// centres, typed by hand from public maps; distances are straight-line, so the
// agent says "about". Aliases are matched after normName (Arabic/English).
import type { LatLng } from "./geo";
import { normName } from "./places";

export interface Landmark { id: string; name_en: string; name_ar: string; at: LatLng; aliases: string[] }

export const LANDMARKS: Landmark[] = [
  { id: "auc", name_en: "AUC (New Cairo campus)", name_ar: "الجامعة الأمريكية بالتجمع", at: { lat: 30.0195, lng: 31.5005 }, aliases: ["auc", "american university", "الجامعة الامريكية", "الامريكية"] },
  { id: "guc", name_en: "German University in Cairo", name_ar: "الجامعة الألمانية", at: { lat: 29.9866, lng: 31.4413 }, aliases: ["guc", "german university", "الجامعة الالمانية", "الالمانية"] },
  { id: "cfc", name_en: "Cairo Festival City", name_ar: "كايرو فستيفال سيتي", at: { lat: 30.0287, lng: 31.4087 }, aliases: ["cairo festival city", "festival city", "cfc", "فستيفال"] },
  { id: "airport", name_en: "Cairo International Airport", name_ar: "مطار القاهرة", at: { lat: 30.1219, lng: 31.4056 }, aliases: ["airport", "cairo airport", "المطار", "مطار القاهره"] },
  { id: "city-stars", name_en: "City Stars", name_ar: "سيتي ستارز", at: { lat: 30.073, lng: 31.346 }, aliases: ["city stars", "citystars", "سيتي ستارز"] },
  { id: "baron", name_en: "Baron Palace (Heliopolis)", name_ar: "قصر البارون", at: { lat: 30.0866, lng: 31.3302 }, aliases: ["baron palace", "baron", "korba", "قصر البارون", "الكوربه"] },
  { id: "tahrir", name_en: "Tahrir Square", name_ar: "ميدان التحرير", at: { lat: 30.0444, lng: 31.2357 }, aliases: ["tahrir", "downtown", "التحرير", "وسط البلد"] },
  { id: "opera", name_en: "Cairo Opera House", name_ar: "دار الأوبرا", at: { lat: 30.0425, lng: 31.2243 }, aliases: ["opera house", "opera", "الاوبرا", "دار الاوبرا"] },
  { id: "cairo-uni", name_en: "Cairo University", name_ar: "جامعة القاهرة", at: { lat: 30.0262, lng: 31.2089 }, aliases: ["cairo university", "جامعه القاهره"] },
  { id: "ain-shams", name_en: "Ain Shams University", name_ar: "جامعة عين شمس", at: { lat: 30.0771, lng: 31.2859 }, aliases: ["ain shams university", "ain shams", "عين شمس"] },
  { id: "maadi-grand", name_en: "Maadi Grand Mall", name_ar: "معادي جراند مول", at: { lat: 29.97, lng: 31.25 }, aliases: ["maadi grand mall", "grand mall", "جراند مول"] },
  { id: "smart-village", name_en: "Smart Village", name_ar: "القرية الذكية", at: { lat: 30.0719, lng: 31.0172 }, aliases: ["smart village", "القريه الذكيه"] },
  { id: "arkan", name_en: "Arkan Plaza (Sheikh Zayed)", name_ar: "أركان بلازا", at: { lat: 30.0186, lng: 30.9928 }, aliases: ["arkan", "arkan plaza", "اركان"] },
  { id: "mall-of-arabia", name_en: "Mall of Arabia", name_ar: "مول العرب", at: { lat: 30.0067, lng: 30.9733 }, aliases: ["mall of arabia", "مول العرب"] },
  { id: "mall-of-egypt", name_en: "Mall of Egypt", name_ar: "مول مصر", at: { lat: 29.9725, lng: 31.0167 }, aliases: ["mall of egypt", "مول مصر"] },
  { id: "pioneer-plaza", name_en: "Pioneer Plaza (New Capital)", name_ar: "بايونير بلازا", at: { lat: 30.036687, lng: 31.681687 }, aliases: ["pioneer plaza", "new capital", "administrative capital", "بايونير", "العاصمه الاداريه", "العاصمه"] },
  { id: "bibliotheca", name_en: "Bibliotheca Alexandrina", name_ar: "مكتبة الإسكندرية", at: { lat: 31.2089, lng: 29.9092 }, aliases: ["bibliotheca", "library of alexandria", "مكتبه الاسكندريه", "المكتبه"] },
  { id: "alex-uni", name_en: "Alexandria University", name_ar: "جامعة الإسكندرية", at: { lat: 31.2087, lng: 29.9154 }, aliases: ["alexandria university", "alex university", "جامعه الاسكندريه"] },
  { id: "san-stefano", name_en: "San Stefano Grand Plaza", name_ar: "سان ستيفانو", at: { lat: 31.2459, lng: 29.966 }, aliases: ["san stefano", "سان ستيفانو"] },
];

// Longest alias or name contained in the query (whole words only).
export function findLandmark(query: string): Landmark | null {
  const q = normName(query);
  if (!q) return null;
  let best: { l: Landmark; len: number } | null = null;
  for (const l of LANDMARKS)
    for (const a of [l.name_en, l.name_ar, ...l.aliases].map(normName))
      if (a && ` ${q} `.includes(` ${a} `) && (!best || a.length > best.len)) best = { l, len: a.length };
  return best?.l ?? null;
}
