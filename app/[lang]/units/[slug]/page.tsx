import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUnit } from "@/lib/db/store";
import UnitViewer from "@/components/UnitViewer";
import BookingForm from "@/components/BookingForm";
import LangToggle from "@/components/LangToggle";
import { formatEgp, getT, localeHref } from "@/lib/i18n";
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
  const specRows: [string, string][] = [
    [t("spec.area"), specs.area_m2_estimate ? `~${specs.area_m2_estimate} m²` : "—"],
    [t("spec.deskCapacity"), specs.desk_capacity != null ? String(specs.desk_capacity) : "—"],
    [t("spec.condition"), String(specs.condition ?? "—")],
    [t("spec.naturalLight"), String(specs.natural_light ?? "—")],
    [t("spec.flooring"), String(specs.flooring ?? "—")],
  ];
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="text-sm text-zinc-500">← {t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <h1 className="text-2xl font-bold mt-2 leading-snug">{locale === "en" ? unit.title_en : unit.title_ar}</h1>
      <p className="text-zinc-500">{unit.district} · {t("unit.floors")} {unit.floor_text} · {formatEgp(locale, unit.rent_egp)}{t("unit.perMonth")}</p>
      <div className="mt-4"><UnitViewer images={unit.images} locale={locale} /></div>
      <div className="grid gap-5 md:grid-cols-3 mt-6">
        <section className="md:col-span-2 space-y-4">
          <p className="leading-relaxed">{locale === "en" ? unit.summary_en : unit.summary_ar}</p>
          <ul className="list-disc ps-5 space-y-1">{(locale === "en" ? unit.highlights_en : unit.highlights_ar).map((h) => <li key={h}>{h}</li>)}</ul>
          <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4">
            <h3 className="font-semibold mb-2">{t("unit.specsTitle")}</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">{specRows.map(([k, v]) => <div key={k} className="flex justify-between border-b py-1"><dt className="text-zinc-500">{k}</dt><dd>{v}</dd></div>)}</dl>
            <p className="text-xs text-zinc-500 mt-2">{t("unit.specsNote")}</p>
          </div>
        </section>
        <aside>
          {unit.rent_periods.includes("daily") && unit.daily_egp ? <BookingForm slug={unit.slug} dailyEgp={unit.daily_egp} locale={locale} /> : (
            <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4">
              <h3 className="font-semibold">{t("booking.longTermOnly")}</h3>
              <p className="text-sm text-zinc-500 mt-1">{t("booking.longTermNote")}</p>
              <Link href={localeHref("/chat", locale)} className="mt-3 block text-center rounded-full bg-zinc-900 text-white py-2.5 dark:bg-white dark:text-zinc-900">{t("booking.chatArrange")}</Link>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
