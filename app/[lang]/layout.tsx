import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "../globals.css";
import { dirFor, locales } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/metadata";

const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["800", "900"], variable: "--font-display" });

// Site defaults (the home page uses these as-is); each page sets its own via lib/metadata.
export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const locale = localeFromParam((await params).lang);
  return {
    ...pageMetadata(locale, { path: "/" }),
    applicationName: "Offisio",
    // Absolute share URLs; unset falls back to the Vercel deployment URL.
    metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined,
  };
}

export const viewport: Viewport = { themeColor: "#D8D3C6" };

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
