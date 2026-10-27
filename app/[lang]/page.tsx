import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { listUnits } from "@/lib/db/store";
import { formatEgp, getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import LangToggle from "@/components/LangToggle";

export const instant = false;

export default async function Home({ params }: PageProps<"/[lang]">) {
  await connection();
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  const units = await listUnits();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t("brand")}</h1>
          <p className="text-zinc-500">{t("home.tagline")}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={localeHref("/upload", locale)} className="rounded-full border px-4 py-2">{t("nav.listOffice")}</Link>
          <Link href={localeHref("/chat", locale)} className="rounded-full bg-zinc-900 text-white px-4 py-2 dark:bg-white dark:text-zinc-900">{t("nav.chatToBook")}</Link>
          <LangToggle locale={locale} />
        </div>
      </header>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => (
          <Link key={u.slug} href={localeHref(`/units/${u.slug}`, locale)} className="overflow-hidden rounded-2xl border bg-white dark:bg-zinc-900 hover:shadow-lg transition">
            <div className="relative aspect-16/10"><Image src={u.images.real} alt="" fill className="object-cover" sizes="33vw" /></div>
            <div className="p-4">
              <h2 className="font-semibold leading-snug">{locale === "en" ? u.title_en : u.title_ar}</h2>
              <p className="text-sm text-zinc-500 mt-1">{u.district} · {formatEgp(locale, u.rent_egp)}{t("unit.perMonth")}{u.daily_egp ? ` · ${formatEgp(locale, u.daily_egp)}${t("unit.perDay")}` : ""}</p>
              <p className="text-xs mt-2 flex gap-1 flex-wrap">{u.rent_periods.map((r) => <span key={r} className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">{t(`track.${r}` as "track.daily")}</span>)}</p>
              <p className="text-xs mt-2 text-zinc-500">{u.kind === "furnished" ? t("unit.furnished") : t("unit.semifinished")}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
