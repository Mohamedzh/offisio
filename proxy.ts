import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, defaultLocale, isLocale, locales } from "./lib/i18n";

// Every page lives under /[lang] (ar | en). Requests without a locale prefix
// redirect to the saved cookie locale, else the default (en).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return NextResponse.next();

  const legacy = request.nextUrl.searchParams.get("lang");
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(legacy) ? legacy : isLocale(cookie) ? cookie : defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  url.searchParams.delete("lang");
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API routes, Next internals, and static/public files (with extensions).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|demo|.*\\..*).*)"],
};
