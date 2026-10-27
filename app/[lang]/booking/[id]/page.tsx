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
        <Link href={localeHref("/", locale)} className="text-sm text-zinc-500">← {t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <h1 className="text-2xl font-bold mt-2 mb-4">{t("bookingPage.title")}</h1>
      <BookingActions id={id} locale={locale} />
      <p className="text-xs text-zinc-500 mt-4">{t("bookingPage.note")}</p>
    </main>
  );
}
