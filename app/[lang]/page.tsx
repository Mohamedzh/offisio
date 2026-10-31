import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { listUnits } from "@/lib/db/store";
import { formatEgp, getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import LangToggle from "@/components/LangToggle";
import Logo from "@/components/Logo";

export const instant = false;

const chip = "bg-ink text-sheet text-[11px] uppercase tracking-wide px-2 py-0.5";
// Decorative art only: generated illustrations in /public/home, never listing
// photos. All listing imagery below comes from the media table via listUnits().
const decorativeBadge = "absolute bottom-3 start-3 bg-mustard text-ink border border-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide";

export default async function Home({ params }: PageProps<"/[lang]">) {
  await connection();
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  const units = await listUnits();
  const featured = units.find((u) => u.images.empty) ?? units[0];
  const rest = units.filter((u) => u !== featured);
  // One comparable spec line per card: area · desks · floor (from specs JSON).
  const specLine = (u: (typeof units)[number]): string => {
    const s = u.specs as { area_m2_estimate?: unknown; desk_capacity?: unknown };
    const parts: string[] = [];
    if (typeof s.area_m2_estimate === "number") parts.push(`~${s.area_m2_estimate} m²`);
    if (typeof s.desk_capacity === "number") parts.push(t("home.desks", { count: s.desk_capacity }));
    if (u.floor_text) parts.push(`${t("unit.floors")} ${u.floor_text}`);
    return parts.join(" · ");
  };
  const steps: [string, string][] = [
    [t("home.step1Title"), t("home.step1Body")],
    [t("home.step2Title"), t("home.step2Body")],
    [t("home.step3Title"), t("home.step3Body")],
  ];
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border border-ink bg-sheet px-3 py-2.5 sm:px-4 sm:py-3 ink-offset-sm mb-8">
        <Link href={localeHref("/", locale)} aria-label={t("brand")}><Logo locale={locale} /></Link>
        <div className="flex flex-wrap gap-1.5 sm:gap-2 text-[13px] sm:text-sm items-center">
          <Link href={localeHref("/upload", locale)} className="px-1.5 py-2 link">{t("nav.listOffice")}</Link>
          <Link href={localeHref("/chat", locale)} className="btn btn-brick px-3 py-2 sm:px-4">{t("nav.chatToBook")}</Link>
          <LangToggle locale={locale} />
        </div>
      </header>

      {/* Hero: copy + decorative generated illustration (not a listing). */}
      <section className="grid gap-8 md:grid-cols-12 md:items-center">
        <div className="md:col-span-5">
          {(() => { const tag = t("home.tagline"); const m = tag.match(/^(.+?[.،])\s*(.*)$/); return (
            <h1 className="font-display font-black tracking-[-0.02em] leading-[1.08] text-4xl sm:text-5xl text-balance"><span className="text-ink">{m ? m[1] : tag}</span>{m?.[2] && <span className="text-chalk"> {m[2]}</span>}</h1> ); })()}
          <p className="mt-4 leading-relaxed text-ink/85">{t("home.sub")}</p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a href="#real-offices" className="btn btn-brick btn-lg">{t("home.browse")}</a>
            <Link href={localeHref("/chat", locale)} className="link">{t("nav.chatToBook")}</Link>
          </div>
        </div>
        <figure className="md:col-span-7 rotate-[-0.7deg]">
          <div className="relative aspect-3/2 overflow-hidden border border-ink bg-sheet ink-offset">
            <Image src="/home/hero-office.jpg" alt="" fill className="object-cover" sizes="(min-width: 768px) 58vw, 100vw" priority />
            <span className={decorativeBadge}>{t("home.decorative")}</span>
          </div>
          <div className="torn-b" aria-hidden />
        </figure>
      </section>

      {/* How it works: numbered editorial strip, no cards-in-cards. */}
      <section className="mt-14 border border-ink bg-sheet ink-offset-sm">
        <h2 className="font-display font-black text-2xl tracking-[-0.02em] px-5 pt-5">{t("home.howTitle")}</h2>
        <div className="grid sm:grid-cols-3 mt-3">
          {steps.map(([title, body], i) => (
            <div key={title} className="border-t-2 border-ink px-5 py-4 sm:border-t-0 sm:border-s sm:first:border-s-0">
              <span className="tnum font-display text-4xl font-black text-brick">{i + 1}</span>
              <h3 className="font-display font-extrabold text-lg mt-2 leading-snug">{title}</h3>
              <p className="text-sm leading-relaxed text-ink/80 mt-1">{body}</p>
            </div>
          ))}
        </div>
        <div className="torn-b" aria-hidden />
      </section>

      {/* Real listings: every photo from the media table. */}
      <section id="real-offices" className="mt-14 scroll-mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display font-black text-3xl sm:text-4xl tracking-[-0.02em]">{t("home.realTitle")}</h2>
          <span className="bg-chalk text-sheet text-xs font-bold px-2.5 py-1.5 max-w-[46ch] leading-snug">{t("home.realNote")}</span>
        </div>

        {featured && (
          <Link href={localeHref(`/units/${featured.slug}`, locale)} className="card-lift block mt-6 border border-ink bg-sheet ink-offset">
            <div className="relative aspect-16/10 overflow-hidden">
              {featured.images.empty && <Image src={featured.images.empty} alt={`${locale === "en" ? featured.title_en : featured.title_ar} — ${t("viewer.empty")}`} fill className="object-cover" sizes="100vw" />}
              <Image src={featured.images.real} alt={`${locale === "en" ? featured.title_en : featured.title_ar} — ${t(featured.synthetic ? "viewer.realSynthetic" : "viewer.real")}`} fill className={`object-cover ${featured.images.empty ? "tear-layer" : ""}`} sizes="100vw" />
              <span className="absolute top-3 inset-s-3 bg-ink text-sheet px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">{t(featured.synthetic ? "viewer.realSynthetic" : "viewer.real")}</span>
              {featured.images.empty && <span className="absolute bottom-3 inset-e-3 bg-mustard text-ink border border-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">{t("viewer.empty")}</span>}
            </div>
            <div className="torn-b" aria-hidden />
            <div className="p-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.02em] leading-snug">{locale === "en" ? featured.title_en : featured.title_ar}</h3>
                <p className="text-sm text-ink/75 mt-1">{featured.district}</p>
                {specLine(featured) && <p className="tnum text-sm font-bold mt-1">{specLine(featured)}</p>}
                <p className="text-xs mt-2 flex gap-1 flex-wrap"><span className={chip}>{featured.kind === "furnished" ? t("unit.furnished") : t("unit.semifinished")}</span>{featured.rent_periods.map((r) => <span key={r} className={chip}>{t(`track.${r}` as "track.daily")}</span>)}{featured.synthetic && <span className="bg-mustard text-ink border border-ink text-[11px] font-bold px-2 py-0.5">{t("unit.synthetic")}</span>}</p>
              </div>
              <span className="tnum bg-brick text-white font-display font-black text-xl px-3 py-1.5 ink-offset-sm">{formatEgp(locale, featured.rent_egp)}{t("unit.perMonth")}</span>
            </div>
          </Link>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mt-8">
          {rest.map((u, i) => (
            <Link key={u.slug} href={localeHref(`/units/${u.slug}`, locale)} className={`card-lift flex flex-col border border-ink bg-sheet ink-offset-sm ${i % 2 === 0 ? "rotate-[-0.6deg]" : "rotate-[0.5deg]"}`}>
              <div className="relative aspect-16/10 overflow-hidden"><Image src={u.images.real} alt={`${locale === "en" ? u.title_en : u.title_ar} — ${t(u.synthetic ? "viewer.realSynthetic" : "viewer.real")}`} fill className="card-img object-cover" sizes="33vw" /></div>
              <div className="torn-b" aria-hidden />
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-display font-extrabold text-lg leading-snug tracking-[-0.02em]">{locale === "en" ? u.title_en : u.title_ar}</h3>
                <p className="tnum mt-2 inline-block bg-brick text-white px-2 py-1 text-sm font-bold">{formatEgp(locale, u.rent_egp)}{t("unit.perMonth")}{u.daily_egp ? ` · ${formatEgp(locale, u.daily_egp)}${t("unit.perDay")}` : ""}</p>
                <p className="text-sm text-ink/75 mt-2">{u.district}</p>
                {specLine(u) && <p className="tnum text-sm font-bold mt-1">{specLine(u)}</p>}
                <p className="text-xs mt-auto pt-3 flex gap-1 flex-wrap"><span className={chip}>{u.kind === "furnished" ? t("unit.furnished") : t("unit.semifinished")}</span>{u.rent_periods.map((r) => <span key={r} className={chip}>{t(`track.${r}` as "track.daily")}</span>)}{u.synthetic && <span className="bg-mustard text-ink border border-ink text-[11px] font-bold px-2 py-0.5">{t("unit.synthetic")}</span>}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Fit concepts explainer with the second decorative illustration. */}
      <section className="mt-14 grid gap-8 md:grid-cols-12 md:items-center">
        <figure className="md:col-span-7 rotate-[0.6deg]">
          <div className="relative aspect-3/2 overflow-hidden border border-ink bg-sheet ink-offset">
            <Image src="/home/fit-concept.jpg" alt="" fill className="object-cover" sizes="(min-width: 768px) 58vw, 100vw" />
            <span className={decorativeBadge}>{t("home.decorative")}</span>
          </div>
          <div className="torn-b" aria-hidden />
        </figure>
        <div className="md:col-span-5">
          <h2 className="font-display font-black text-3xl tracking-[-0.02em] leading-tight">{t("home.fitTitle")}</h2>
          <p className="mt-3 leading-relaxed text-ink/85">{t("home.fitBody")}</p>
          <Link href={localeHref("/upload", locale)} className="btn btn-ink btn-lg mt-5">{t("home.fitCta")}</Link>
        </div>
      </section>

      {/* Owner block: the owner path lives here, not above the fold. */}
      <section className="mt-14 border border-ink bg-sheet ink-offset-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-black text-2xl tracking-[-0.02em]">{t("home.ownerTitle")}</h2>
          <p className="text-sm leading-relaxed text-ink/80 mt-1 max-w-[52ch]">{t("home.ownerBody")}</p>
        </div>
        <Link href={localeHref("/upload", locale)} className="btn btn-ink btn-lg">{t("home.fitCta")}</Link>
      </section>

      <footer className="mt-14 border-t-2 border-ink pt-4 flex flex-wrap justify-between gap-2 text-sm text-ink/75">
        <Logo locale={locale} size="sm" />
        <span>{t("home.decorative")}</span>
      </footer>
    </main>
  );
}
