import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUnit } from "@/lib/db/store";
import UnitViewer from "@/components/UnitViewer";
import StageButtons from "@/components/StageButtons";
import { planStaging } from "@/lib/pipeline/staging";
import type { Survey } from "@/lib/pipeline/survey";
import BookingForm from "@/components/BookingForm";
import LangToggle from "@/components/LangToggle";
import { formatEgp, getT, localeHref, type TranslationKey } from "@/lib/i18n";
import type { UseVerdict } from "@/lib/pipeline/rubric";
import { localeFromParam } from "@/lib/i18n/server";

export const instant = false;

export default async function UnitPage({ params }: PageProps<"/[lang]/units/[slug]">) {
  await connection();
  const { slug, lang } = await params;
  const locale = localeFromParam(lang);
  const t = getT(locale);
  const unit = await getUnit(slug);
  if (!unit) notFound();
  const specs = unit.specs as Record<string, unknown>;
  // Passing uses first; rubric verdicts come from docs/RUBRIC.md.
  const order = { fits: 0, fits_after_fitout: 1, not_suitable: 2 } as const;
  const uses = ((specs.uses as UseVerdict[] | undefined) ?? []).slice().sort((a, b) => order[a.verdict] - order[b.verdict]);
  // Fit-out styles the rubric plans but that are not rendered yet (live uploads, O1).
  const rendered = new Set(unit.images.staged.map((s) => s.style));
  // Synthetic units are staged by script to their brief's target uses only.
  const missingStyles = !unit.synthetic && specs.survey && specs.uses ? planStaging(specs.survey as Survey, specs.uses as UseVerdict[]).map((j) => j.style).filter((s) => !rendered.has(s)) : [];
  const specRows: [string, string][] = [
    [t("spec.area"), specs.area_m2_estimate ? `~${specs.area_m2_estimate} m²` : "—"],
    ...(specs.rooms_count != null ? [[t("spec.rooms"), String(specs.rooms_count)], [t("spec.bathrooms"), String(specs.bathrooms_count ?? 0)]] as [string, string][] : []),
    [t("spec.deskCapacity"), specs.desk_capacity != null ? String(specs.desk_capacity) : "—"],
    [t("spec.condition"), String(specs.condition ?? "—")],
    [t("spec.naturalLight"), String(specs.natural_light ?? "—")],
    [t("spec.flooring"), String(specs.flooring ?? "—")],
  ];
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="link-back"><span className="arr" aria-hidden>←</span>{t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <h1 className="font-display text-4xl sm:text-5xl font-black mt-4 leading-[1.02] tracking-[-0.02em]">{locale === "en" ? unit.title_en : unit.title_ar}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-ink/75"><span className="w-full sm:w-auto">{unit.district} · {t("unit.floors")} {unit.floor_text}</span><span className="tnum bg-brick text-white font-display font-black px-3 py-1 ink-offset-sm">{formatEgp(locale, unit.rent_egp)}{t("unit.perMonth")}</span></p>
      {unit.synthetic && <p className="mt-3"><span className="bg-mustard text-ink border border-ink text-[11px] font-bold px-2 py-0.5">{t("unit.synthetic")}</span></p>}
      <div className="mt-5 border border-ink bg-sheet p-3 ink-offset"><UnitViewer images={unit.images} locale={locale} synthetic={unit.synthetic} /><StageButtons slug={unit.slug} styles={missingStyles} locale={locale} /></div>
      {unit.video && (
        <div className="mt-5 border border-ink bg-sheet p-3 ink-offset">
          <video controls playsInline preload="metadata" poster={unit.images.real || undefined} src={unit.video} className="w-full aspect-video bg-ink" />
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-3 mt-8">
        <section className="md:col-span-2">
          <div className="border border-ink bg-sheet ink-offset-sm">
            <div className="p-5">
              <p className="leading-relaxed">{locale === "en" ? unit.summary_en : unit.summary_ar}</p>
              <ul className="mt-4 space-y-0">{(locale === "en" ? unit.highlights_en : unit.highlights_ar).map((h) => <li key={h} className="border-t border-ink/25 py-2 ps-3">{h}</li>)}</ul>
            </div>
            <div className="torn-t" aria-hidden /><div className="torn-b" aria-hidden />
            <div className="p-5">
              <h3 className="font-display font-black text-xl tracking-[-0.02em] mb-2">{t("unit.specsTitle")}</h3>
              <dl className="text-sm">{specRows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-ink/25 py-2"><dt className="text-[11px] uppercase tracking-wide text-ink/75 pt-0.5">{k}</dt><dd className="tnum font-bold">{v}</dd></div>)}</dl>
              <p className="text-xs text-ink/75 mt-3">{t("unit.specsNote")}</p>
              {uses.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-display font-black text-xl tracking-[-0.02em] mb-2">{t("unit.usesTitle")}</h3>
                  <ul className="text-sm">
                    {uses.map((u) => (
                      <li key={u.use} className="border-b border-ink/25 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold">{t(`use.${u.use}` as TranslationKey)}</span>
                          <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 border border-ink ${u.verdict === "fits" ? "bg-ink text-sheet" : u.verdict === "fits_after_fitout" ? "bg-mustard text-ink" : "bg-sheet text-ink/60"}`}>{t(`verdict.${u.verdict}` as TranslationKey)}</span>
                        </div>
                        <p className="text-xs text-ink/75 mt-1">{(locale === "en" ? u.reasons_en : u.reasons_ar).join(" ")}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-ink/75 mt-2">{t("unit.usesNote")}</p>
                </div>
              )}
            </div>
          </div>
        </section>
        <aside>
          {unit.rent_periods.includes("daily") && unit.daily_egp ? <BookingForm slug={unit.slug} dailyEgp={unit.daily_egp} locale={locale} /> : (
            <div className="border border-ink bg-sheet p-5 ink-offset-sm">
              <h3 className="font-display font-black text-lg">{t("booking.longTermOnly")}</h3>
              <p className="text-sm text-ink/75 mt-1">{t("booking.longTermNote")}</p>
              <Link href={localeHref("/chat", locale)} className="btn btn-brick btn-md mt-3 w-full">{t("booking.chatArrange")}</Link>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
