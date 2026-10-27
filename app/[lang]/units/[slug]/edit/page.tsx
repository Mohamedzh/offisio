import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUnit } from "@/lib/db/store";
import SpecsEditForm from "@/components/SpecsEditForm";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";

export const instant = false;

export default async function EditUnitPage({ params }: PageProps<"/[lang]/units/[slug]/edit">) {
  await connection();
  const { slug, lang } = await params;
  const locale = localeFromParam(lang);
  const t = getT(locale);
  const unit = await getUnit(slug);
  if (!unit) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="text-sm text-zinc-500">← {t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <h1 className="text-2xl font-bold mt-2 mb-4">{t("edit.title")}</h1>
      <SpecsEditForm slug={slug} specs={unit.specs} locale={locale} />
      <Link href={localeHref(`/units/${slug}`, locale)} className="mt-4 inline-block text-sm underline">{t("edit.viewListing")}</Link>
    </main>
  );
}
