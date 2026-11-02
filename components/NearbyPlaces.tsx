// Unit page "Nearby" section (plan/06 6.7 step 6): stored places with their
// chain menu. Places attribution per Google terms; menu source label per AGENTS rule 2.
import { formatEgp, getT, type Locale } from "@/lib/i18n";
import type { Nearby } from "@/lib/nearby";

const TOP_ITEMS = 6;

export function formatDistance(locale: Locale, m: number): string {
  const t = getT(locale); const nf = (n: number) => n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");
  return m < 1000 ? t("nearby.m", { n: nf(Math.round(m / 10) * 10) }) : t("nearby.km", { n: nf(Math.round(m / 100) / 10) });
}

export default function NearbyPlaces({ places, daily, locale }: { places: Nearby[]; daily: boolean; locale: Locale }) {
  const t = getT(locale);
  const hasMenu = places.some((p) => p.items.length);
  return (
    <section className="mt-8 border border-ink bg-sheet p-5 ink-offset-sm">
      <h3 className="font-display font-black text-xl tracking-[-0.02em]">{t("nearby.title")}</h3>
      <p className="text-xs text-ink/75 mt-1">{t("nearby.note")}{hasMenu && ` ${t(daily ? "nearby.dailyHint" : "nearby.infoHint")}`}</p>
      {places.length === 0 && <p className="text-sm mt-3">{t("nearby.empty")}</p>}
      <div className="grid gap-5 sm:grid-cols-2 mt-4">
        {places.map((p) => (
          <div key={p.place_id} className="border-t border-ink pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-bold" dir="auto">{p.name}</span>
              <span className="tnum text-sm text-ink/75">{formatDistance(locale, p.distance_m)}</span>
            </div>
            <a href={p.maps_url} target="_blank" rel="noopener noreferrer" className="link text-sm">{t("unit.openInMaps")}</a>
            {p.items.length ? (
              <>
                <p className="text-[11px] uppercase tracking-wide text-ink/75 mt-3">{t("nearby.fromMenu", { brand: locale === "ar" ? p.brand_ar ?? p.brand! : p.brand! })}</p>
                <ul className="text-sm">
                  {p.items.slice(0, TOP_ITEMS).map((it) => (
                    <li key={it.id} className="tnum flex justify-between gap-3 border-b border-ink/25 py-1.5">
                      <span>{locale === "ar" ? it.name_ar : it.name_en}</span><span className="shrink-0">{formatEgp(locale, it.price_egp)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="text-sm text-ink/75 mt-2">{t("nearby.menuNotListed")}</p>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink/75 mt-4 flex flex-wrap gap-x-4 gap-y-1">
        <span>{t("nearby.attribution")}</span>
        {hasMenu && <span>{t("nearby.menuSource")}</span>}
      </p>
    </section>
  );
}
