import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "../globals.css";
import { dirFor, locales } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";

const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["800", "900"], variable: "--font-display" });

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
    <html lang={locale} dir={dirFor(locale)} className={`h-full antialiased ${cairo.variable}`}>
      <body className="min-h-full flex flex-col bg-board text-ink">{children}</body>
    </html>
  );
}
