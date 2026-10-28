"use client";
import { usePathname, useRouter } from "next/navigation";
import { LOCALE_COOKIE, getT, otherLocale, switchLocalePath, type Locale } from "@/lib/i18n";

export default function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter(); const pathname = usePathname();
  const next = otherLocale(locale); const t = getT(locale);
  function switchTo() {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.push(switchLocalePath(pathname, next));
  }
  return <button onClick={switchTo} className="border border-ink bg-sheet px-3 py-2 sm:px-4 text-[13px] sm:text-sm font-bold">{t("nav.switchLocale")}</button>;
}
