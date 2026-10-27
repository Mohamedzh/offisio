// Server-only locale handling for the /[lang] segment: the route param is
// the single source of truth (proxy.ts supplies the default when missing).
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./index";

export function localeFromParam(lang: string): Locale {
  if (!isLocale(lang)) notFound();
  return lang;
}
