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
import { isDemoUnit, readSpecsPreview } from "@/lib/demo-units";
import OwnerBar from "@/components/OwnerBar";
import { currentOwner, draftPublishMode, editMode, maskWaId } from "@/lib/owner";
import { safeErrorCode } from "@/lib/guard";
import DraftBanner, { PublishedNotice } from "@/components/DraftBanner";
import ListingReview from "@/components/ListingReview";

export const instant = false;

// Owner-only page: generic title, never indexed.
export async function generateMetadata({ params }: PageProps<"/[lang]/units/[slug]/edit">): Promise<Metadata> {
  const { slug, lang } = await params;
  const locale = localeFromParam(lang);
  return pageMetadata(locale, { title: getT(locale)("meta.editTitle"), path: `/units/${slug}/edit`, noindex: true });
}

export default async function EditUnitPage({ params, searchParams }: PageProps<"/[lang]/units/[slug]/edit">) {
  await connection();
  const { slug, lang } = await params;
  const locale = localeFromParam(lang);
  const t = getT(locale);
  const [unit, ref] = await Promise.all([getUnit(slug), unitRef(slug)]);
  if (!unit || !ref) notFound();
  const owner = await currentOwner();
  const mode = await editMode(slug, owner);
  const [rawJobs, preview] = await Promise.all([jobsOf(ref.id), readSpecsPreview(slug, mode)]);
  // Same rule as GET /api/units/[slug]/pipeline: last_error only for the owner, only as a fixed code.
  const jobs = rawJobs.map((j) => ({ ...j, last_error: mode === "owner" && j.last_error ? safeErrorCode(j.last_error) : null }));
  const publish = unit.draft ? draftPublishMode(slug, mode, owner) : null;
  // Post-publish notice (?published=...): only for the unit's own owner.
  const published = unit.draft || mode !== "owner" ? undefined : (await searchParams).published;
  const loginHref = `${localeHref("/login", locale)}?next=${encodeURIComponent(localeHref(`/units/${slug}/edit`, locale))}`;
  // Preview mode (not this unit's owner): the form starts from this visitor's previewed edits, if any.
  const specs = { ...unit.specs, ...preview };
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
          {owner && <OwnerBar phone={maskWaId(owner.waId)} locale={locale} className="-mt-2 mb-2" />}
          {unit.draft && <DraftBanner slug={slug} locale={locale} publish={publish} loginHref={loginHref} className="mb-4">{mode === "owner" && <ListingReview slug={slug} locale={locale} className="mt-3" />}</DraftBanner>}
          <PublishedNotice locale={locale} state={published} className="mb-4" />
          {/* AI listing review: the owner only (never demo units, which are always preview). */}
          {!unit.draft && mode === "owner" && <ListingReview slug={slug} locale={locale} className="mb-4" />}
          {mode === "preview" && (
            <p className="mb-4 text-sm text-ink/75">
              {t(isDemoUnit(slug) ? "demo.editNote" : "preview.editNote")} <Link href={localeHref("/upload", locale)} className="link">{t("demo.uploadLink")}</Link>
              {!owner && !isDemoUnit(slug) && <> · <Link href={localeHref("/login", locale)} className="link">{t("owner.signInLink")}</Link></>}
            </p>
          )}
          <PipelineStatus slug={slug} initial={jobs} locale={locale} />
          {/* Remount when the analyze step lands, so the form never holds (or saves) stale empty specs. */}
          <SpecsEditForm key={unit.specs.survey ? "analyzed" : "pending"} slug={slug} specs={specs} locale={locale} demo={mode === "preview"} />
          <Link href={localeHref(`/units/${slug}`, locale)} className="mt-4 inline-block text-sm link">{t("edit.viewListing")}</Link>
        </div>
      </div>
    </main>
  );
}
