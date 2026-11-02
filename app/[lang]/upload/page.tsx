import Link from "next/link";
import UploadForm from "@/components/UploadForm";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { connection } from "next/server";
import OwnerBar from "@/components/OwnerBar";
import WhatsAppLogin from "@/components/WhatsAppLogin";
import { currentOwner, maskWaId } from "@/lib/owner";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/upload">): Promise<Metadata> {
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  return pageMetadata(locale, { title: t("meta.uploadTitle"), description: t("meta.uploadDescription"), path: "/upload" });
}

export default async function UploadPage({ params }: PageProps<"/[lang]/upload">) {
  await connection();
  const owner = await currentOwner();
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="link-back"><span className="arr" aria-hidden>←</span>{t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <div className="mt-4 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mb-4">{t("upload.title")}</h1>
          {/* Owners sign in with WhatsApp first; the uploaded unit is theirs. */}
          {owner ? (
            <>
              <OwnerBar phone={maskWaId(owner.waId)} locale={locale} className="-mt-2 mb-4" />
              <UploadForm locale={locale} />
            </>
          ) : (
            <WhatsAppLogin locale={locale} />
          )}
        </div>
      </div>
    </main>
  );
}
