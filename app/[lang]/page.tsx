import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { listUnits } from "@/lib/db/store";
import { formatEgp, getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import LangToggle from "@/components/LangToggle";

export const instant = false;

const chip = "bg-ink text-sheet text-[11px] uppercase tracking-wide px-2 py-0.5";

export default async function Home({ params }: PageProps<"/[lang]">) {
  await connection();
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  const units = await listUnits();
  const featured = units.find((u) => u.images.empty) ?? units[0];
  const rest = units.filter((u) => u !== featured);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border border-ink bg-sheet px-4 py-3 ink-offset-sm mb-8">
        <span className="font-display text-2xl font-black tracking-[-0.02em]">{t("brand")}</span>
        <div className="flex flex-wrap gap-2 text-sm items-center">
          <Link href={localeHref("/upload", locale)} className="border border-ink bg-sheet px-4 py-2 font-bold">{t("nav.listOffice")}</Link>
          <Link href={localeHref("/chat", locale)} className="bg-brick text-white px-4 py-2 font-bold uppercase">{t("nav.chatToBook")}</Link>
          <LangToggle locale={locale} />
        </div>
      </header>

      {(() => { const tag = t("home.tagline"); const m = tag.match(/^(.+?[.،])\s*(.*)$/); return (
        <h1 className="font-display font-black tracking-[-0.02em] leading-[1.05] text-4xl sm:text-6xl max-w-[16ch]"><span className="text-ink">{m ? m[1] : tag}</span>{m?.[2] && <span className="text-chalk"> {m[2]}</span>}</h1> ); })()}

      {featured && (
        <Link href={localeHref(`/units/${featured.slug}`, locale)} className="block mt-8 border border-ink bg-sheet ink-offset hover:rotate-0 transition-transform">
          <div className="relative aspect-16/10 overflow-hidden">
            {featured.images.empty && <Image src={featured.images.empty} alt="" fill className="object-cover" sizes="100vw" />}
            <Image src={featured.images.real} alt="" fill className={`object-cover ${featured.images.empty ? "tear-layer" : ""}`} sizes="100vw" priority />
            {featured.images.empty && <div className="tear-seam absolute inset-x-0 bottom-[5%] pointer-events-none" aria-hidden />}
          </div>
          <div className="torn-b" aria-hidden />
          <div className="p-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.02em] leading-snug">{locale === "en" ? featured.title_en : featured.title_ar}</h2>
              <p className="text-sm text-ink/75 mt-1">{featured.district}</p>
              <p className="text-xs mt-2 flex gap-1 flex-wrap"><span className={chip}>{featured.kind === "furnished" ? t("unit.furnished") : t("unit.semifinished")}</span>{featured.rent_periods.map((r) => <span key={r} className={chip}>{t(`track.${r}` as "track.daily")}</span>)}</p>
            </div>
            <span className="tnum bg-brick text-white font-display font-black text-xl px-3 py-1.5 ink-offset-sm">{formatEgp(locale, featured.rent_egp)}{t("unit.perMonth")}</span>
          </div>
        </Link>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mt-10">
        {rest.map((u, i) => (
          <Link key={u.slug} href={localeHref(`/units/${u.slug}`, locale)} className={`block border border-ink bg-sheet ink-offset-sm transition-transform hover:rotate-0 ${i % 2 === 0 ? "-rotate-[0.6deg]" : "rotate-[0.5deg]"}`}>
            <div className="relative aspect-16/10"><Image src={u.images.real} alt="" fill className="object-cover" sizes="33vw" /></div>
            <div className="torn-b" aria-hidden />
            <div className="p-4">
              <h2 className="font-display font-extrabold text-lg leading-snug tracking-[-0.02em]">{locale === "en" ? u.title_en : u.title_ar}</h2>
              <p className="tnum mt-2 inline-block bg-brick text-white px-2 py-1 text-sm font-bold">{formatEgp(locale, u.rent_egp)}{t("unit.perMonth")}{u.daily_egp ? ` · ${formatEgp(locale, u.daily_egp)}${t("unit.perDay")}` : ""}</p>
              <p className="text-sm text-ink/75 mt-2">{u.district}</p>
              <p className="text-xs mt-2 flex gap-1 flex-wrap"><span className={chip}>{u.kind === "furnished" ? t("unit.furnished") : t("unit.semifinished")}</span>{u.rent_periods.map((r) => <span key={r} className={chip}>{t(`track.${r}` as "track.daily")}</span>)}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
