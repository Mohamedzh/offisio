// Bilingual UI: English default (defaultLocale), Arabic RTL variant.
// Routing: every page under /[lang] (proxy.ts supplies the default locale);
// dictionaries are JSON (ar.json / en.json, identical keys). This module is
// pure and safe in both Server and Client Components.
import ar from "./ar.json";
import en from "./en.json";

export type Locale = "ar" | "en";
export const locales: Locale[] = ["ar", "en"];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "offisio-lang";

const dictionaries = { ar, en } as const;
export type TranslationKey = keyof typeof ar;

export function isLocale(v: unknown): v is Locale {
  return v === "ar" || v === "en";
}
export function resolveLocale(v?: string | null): Locale {
  return isLocale(v) ? v : defaultLocale;
}
export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}
// Every page lives under /[lang]: /ar/... and /en/... are the two variants.
export function localeHref(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
// Swap the locale prefix of a current pathname (for LangToggle).
export function switchLocalePath(pathname: string, locale: Locale): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length && isLocale(parts[0])) parts[0] = locale; else parts.unshift(locale);
  return `/${parts.join("/")}`;
}

export type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;
export function getT(locale: Locale): T {
  const dict = dictionaries[locale] as Record<string, string>;
  const fallback = dictionaries[defaultLocale] as Record<string, string>;
  return (key, vars) => {
    let s = dict[key] ?? fallback[key] ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

// API error code -> localized text ("error.<CODE>" keys), else the raw code.
export function errorText(t: T, code: string): string {
  const key = `error.${code}`;
  const s = t(key as TranslationKey);
  return s === key ? code : s;
}

// Owners type floors in English ("2nd", "Ground"); show them as "2nd floor" / "الدور التاني".
const AR_ORDINALS = ["الأول", "التاني", "التالت", "الرابع", "الخامس", "السادس", "السابع", "التامن", "التاسع", "العاشر"];
export function floorLabel(locale: Locale, text: string): string {
  const s = text.trim();
  const n = /^(\d{1,2})(st|nd|rd|th)?$/i.exec(s);
  const ground = /^ground\b\s*/i.exec(s);
  if (locale === "ar") {
    if (n && +n[1] >= 1 && +n[1] <= AR_ORDINALS.length) return `الدور ${AR_ORDINALS[+n[1] - 1]}`;
    // "Ground (villa floor)": the English note is dropped rather than mixed in.
    if (ground) return /villa/i.test(s) ? "الدور الأرضي (دور فيلا)" : "الدور الأرضي";
  } else {
    if (n) return `${n[2] ? s : ordinalEn(+n[1])} floor`;
    if (ground) return `Ground floor${s.slice(ground[0].length) ? ` ${s.slice(ground[0].length)}` : ""}`;
  }
  return `${getT(locale)("unit.floors")} ${s}`;
}
// Districts are stored as typed (mostly English). Arabic pages translate the known
// names; anything with English left over is shown as typed, never half-translated.
const AR_PLACES: [string, string][] = [
  ["New Administrative Capital", "العاصمة الإدارية الجديدة"], ["Bibliotheca Alexandrina", "مكتبة إسكندرية"],
  ["6th of October", "6 أكتوبر"], ["5th Settlement", "التجمع الخامس"], ["Smart Village", "القرية الذكية"],
  ["Pioneer Plaza", "بايونير بلازا"], ["Talaat Harb", "طلعت حرب"], ["Sheikh Zayed", "الشيخ زايد"],
  ["Heliopolis", "مصر الجديدة"], ["Nasr City", "مدينة نصر"], ["New Cairo", "القاهرة الجديدة"],
  ["Downtown", "وسط البلد"], ["Zamalek", "الزمالك"], ["Maadi", "المعادي"], ["Dokki", "الدقي"],
  ["Mohandessin", "المهندسين"], ["Chatby", "الشاطبي"], ["Louran", "لوران"], ["Smouha", "سموحة"],
  ["Alexandria", "إسكندرية"], ["Cairo", "القاهرة"], ["Giza", "الجيزة"], ["near", "جنب"],
];
export function districtLabel(locale: Locale, district: string): string {
  if (locale !== "ar") return district;
  let s = district;
  for (const [en, ar] of AR_PLACES) s = s.replace(new RegExp(`\\b${en}\\b`, "gi"), ar);
  s = s.replace(/,/g, "،");
  return /[A-Za-z]/.test(s) ? district : s;
}

function ordinalEn(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${tail}`;
}

export function formatEgp(locale: Locale, amount: number): string {
  return getT(locale)("money.egp", { amount: amount.toLocaleString(locale === "ar" ? "ar-EG" : "en-US") });
}
