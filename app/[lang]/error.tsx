"use client";
// Branded error boundary for pages under /[lang] (not the layout itself).
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Logo from "@/components/Logo";
import { getT, localeHref, resolveLocale } from "@/lib/i18n";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = resolveLocale(useParams<{ lang?: string }>().lang);
  const t = getT(locale);
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href={localeHref("/", locale)} aria-label={t("brand")}><Logo locale={locale} /></Link>
      <div role="alert" className="mt-6 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <h1 className="font-display text-3xl font-black tracking-[-0.02em]">{t("notFound.errorTitle")}</h1>
          <p className="text-ink/80 mt-2">{t("notFound.errorBody")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => retry()} className="btn btn-brick btn-md">{t("notFound.retry")}</button>
            <Link href={localeHref("/", locale)} className="link">{t("nav.allOffices")}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
