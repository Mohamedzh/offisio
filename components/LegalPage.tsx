import Link from "next/link";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref, type Locale } from "@/lib/i18n";

// Shared layout for the privacy and terms pages (required to publish the Meta
// app, docs/plan/06 6.8). Long-form copy stays in each page, not the dictionaries.
export interface LegalCopy { title: string; updated: string; intro: string; sections: { id?: string; h: string; p: string[] }[] }

// "Last updated": the day the privacy/terms copy last changed. Bump it by hand
// whenever either page's text changes (a fixed date keeps the pages fully static).
const LAST_UPDATED = "2026-11-04";

// Calendar day, UTC; Arabic with Western digits.
const formatDay = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`));

function UpdatedOn({ label, locale }: { label: string; locale: Locale }) {
  return <p className="text-xs text-ink/60 mb-4">{label}: <time dateTime={LAST_UPDATED}>{formatDay(LAST_UPDATED, locale)}</time></p>;
}

export default function LegalPage({ locale, copy }: { locale: Locale; copy: LegalCopy }) {
  const t = getT(locale);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="link-back"><span className="arr" aria-hidden>←</span>{t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <article className="mt-4 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mb-1">{copy.title}</h1>
          <UpdatedOn label={copy.updated} locale={locale} />
          <p className="text-sm leading-relaxed text-ink/80">{copy.intro}</p>
          {copy.sections.map((s) => (
            <section key={s.h} id={s.id} className="mt-6 scroll-mt-6">
              <h2 className="font-display text-xl font-black tracking-[-0.02em] mb-2">{s.h}</h2>
              {s.p.map((p) => <p key={p} className="text-sm leading-relaxed text-ink/80 mt-2">{p}</p>)}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
