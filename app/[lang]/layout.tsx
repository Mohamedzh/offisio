import type { Metadata } from "next";
import "../globals.css";
import { dirFor, locales } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Offisio — أوفيسيو",
  description: "Turn any office into a bookable, furnished-looking listing from a short video.",
};

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const locale = localeFromParam((await params).lang);
  return (
    <html lang={locale} dir={dirFor(locale)} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">{children}</body>
    </html>
  );
}
