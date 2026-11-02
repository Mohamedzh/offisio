import Link from "next/link";
import { connection } from "next/server";
import LangToggle from "@/components/LangToggle";
import OwnerBar from "@/components/OwnerBar";
import WhatsAppLogin from "@/components/WhatsAppLogin";
import { getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import { currentOwner, maskWaId } from "@/lib/owner";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const locale = localeFromParam((await params).lang);
  return pageMetadata(locale, { title: getT(locale)("login.title"), path: "/login", noindex: true });
}

// Owner sign-in with WhatsApp; renters never need an account.
export default async function LoginPage({ params }: PageProps<"/[lang]/login">) {
  await connection();
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  const owner = await currentOwner();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="link-back"><span className="arr" aria-hidden>←</span>{t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <div className="mt-4 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mb-4">{t("login.title")}</h1>
          {owner ? (
            <>
              <OwnerBar phone={maskWaId(owner.waId)} locale={locale} />
              <Link href={localeHref("/upload", locale)} className="btn btn-brick mt-4 inline-block px-4 py-2">{t("nav.listOffice")}</Link>
            </>
          ) : (
            <WhatsAppLogin locale={locale} redirectTo={localeHref("/upload", locale)} />
          )}
        </div>
      </div>
    </main>
  );
}
