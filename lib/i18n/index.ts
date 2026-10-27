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

export function formatEgp(locale: Locale, amount: number): string {
  return getT(locale)("money.egp", { amount: amount.toLocaleString(locale === "ar" ? "ar-EG" : "en-US") });
}
