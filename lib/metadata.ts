// Page metadata for sharing and search. Next replaces (does not merge) a parent's
// openGraph/twitter objects, so every page builds the full set here.
import type { Metadata } from "next";
import { getT, localeHref, locales, type Locale } from "@/lib/i18n";

export interface PageMeta {
  title?: string; // omitted on the home page: uses the site title as-is
  description?: string;
  path: string; // locale-less path, e.g. "/chat"
  image?: { url: string; alt: string }; // defaults to the brand card (app/opengraph-image.png)
  noindex?: boolean; // private or owner-only pages
}

export function pageMetadata(locale: Locale, { title, description, path, image, noindex }: PageMeta): Metadata {
  const t = getT(locale);
  const site = t("meta.siteTitle");
  const fullTitle = title ? `${title} · ${t("brand")}` : site;
  const desc = description ?? t("meta.siteDescription");
  const images = [image ?? { url: "/opengraph-image.png", width: 1200, height: 630, alt: t("meta.ogAlt") }];
  return {
    title: title ? { absolute: fullTitle } : { absolute: site },
    description: desc,
    alternates: {
      canonical: localeHref(path, locale),
      languages: { ...Object.fromEntries(locales.map((l) => [l, localeHref(path, l)])), "x-default": localeHref(path, "en") },
    },
    openGraph: {
      type: "website",
      siteName: t("brand"),
      title: fullTitle,
      description: desc,
      url: localeHref(path, locale),
      locale: locale === "ar" ? "ar_EG" : "en_US",
      alternateLocale: locale === "ar" ? "en_US" : "ar_EG",
      images,
    },
    twitter: { card: "summary_large_image", title: fullTitle, description: desc, images },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

// Social cards cut descriptions around 160 characters; trim on a word boundary.
export function clip(text: string, max = 160): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length)}…`;
}
