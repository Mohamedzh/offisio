import Link from "next/link";
import BookingActions from "@/components/BookingActions";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";

export const instant = false;

export default async function BookingPage({ params }: PageProps<"/[lang]/booking/[id]">) {
  const { id, lang } = await params;
  const locale = localeFromParam(lang);
  const t = getT(locale);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="text-sm font-bold text-ink">← {t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <div className="mt-4 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mb-4">{t("bookingPage.title")}</h1>
          <BookingActions id={id} locale={locale} />
          <p className="text-xs text-ink/75 mt-4">{t("bookingPage.note")}</p>
        </div>
      </div>
    </main>
  );
}
