"use client";
// Branded 404 for everything under /[lang]: notFound() from a page (e.g. an unknown
// unit slug) and unmatched paths (via [...missing]). not-found gets no props, so the
// locale comes from the route params.
import Link from "next/link";
import { useParams } from "next/navigation";
import Logo from "@/components/Logo";
import { getT, localeHref, resolveLocale } from "@/lib/i18n";

export default function NotFound() {
  const locale = resolveLocale(useParams<{ lang?: string }>().lang);
  const t = getT(locale);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href={localeHref("/", locale)} aria-label={t("brand")}><Logo locale={locale} /></Link>
      <div className="mt-6 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <p className="tnum font-display text-5xl font-black text-brick">404</p>
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mt-2">{t("notFound.title")}</h1>
          <p className="text-ink/80 mt-2">{t("notFound.body")}</p>
          <Link href={localeHref("/", locale)} className="btn btn-brick btn-md mt-5">{t("nav.allOffices")}</Link>
        </div>
      </div>
    </main>
  );
}
