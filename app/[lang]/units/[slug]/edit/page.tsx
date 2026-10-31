import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUnit, jobsOf, unitRef } from "@/lib/db/store";
import PipelineStatus from "@/components/PipelineStatus";
import SpecsEditForm from "@/components/SpecsEditForm";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const instant = false;

// Owner-only page: generic title, never indexed.
export async function generateMetadata({ params }: PageProps<"/[lang]/units/[slug]/edit">): Promise<Metadata> {
  const { slug, lang } = await params;
  const locale = localeFromParam(lang);
  return pageMetadata(locale, { title: getT(locale)("meta.editTitle"), path: `/units/${slug}/edit`, noindex: true });
}

export default async function EditUnitPage({ params }: PageProps<"/[lang]/units/[slug]/edit">) {
  await connection();
  const { slug, lang } = await params;
  const locale = localeFromParam(lang);
  const t = getT(locale);
  const [unit, ref] = await Promise.all([getUnit(slug), unitRef(slug)]);
  if (!unit || !ref) notFound();
  const jobs = await jobsOf(ref.id);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="link-back"><span className="arr" aria-hidden>←</span>{t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <div className="mt-4 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mb-4">{t("edit.title")}</h1>
          <PipelineStatus slug={slug} initial={jobs} locale={locale} />
          {/* Remount when the analyze step lands, so the form never holds (or saves) stale empty specs. */}
          <SpecsEditForm key={unit.specs.survey ? "analyzed" : "pending"} slug={slug} specs={unit.specs} locale={locale} />
          <Link href={localeHref(`/units/${slug}`, locale)} className="mt-4 inline-block text-sm link">{t("edit.viewListing")}</Link>
        </div>
      </div>
    </main>
  );
}
