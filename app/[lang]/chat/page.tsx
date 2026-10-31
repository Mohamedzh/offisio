import Link from "next/link";
import ChatBox from "@/components/ChatBox";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata({ params }: PageProps<"/[lang]/chat">): Promise<Metadata> {
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  return pageMetadata(locale, { title: t("meta.chatTitle"), description: t("meta.chatDescription"), path: "/chat" });
}

export default async function ChatPage({ params }: PageProps<"/[lang]/chat">) {
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
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mb-1">{t("chat.title")}</h1>
          <p className="text-sm text-ink/75 mb-4">{t("chat.subtitle")}</p>
          <ChatBox locale={locale} />
        </div>
      </div>
    </main>
  );
}
