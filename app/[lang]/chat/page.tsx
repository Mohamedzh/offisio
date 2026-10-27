import Link from "next/link";
import ChatBox from "@/components/ChatBox";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";

export default async function ChatPage({ params }: PageProps<"/[lang]/chat">) {
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="text-sm text-zinc-500">← {t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <h1 className="text-2xl font-bold mt-2 mb-1">{t("chat.title")}</h1>
      <p className="text-sm text-zinc-500 mb-4">{t("chat.subtitle")}</p>
      <ChatBox locale={locale} />
    </main>
  );
}
