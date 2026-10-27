import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offisio — أوفيسيو",
  description: "Turn any office into a bookable, furnished-looking listing from a short video.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">{children}</body>
    </html>
  );
}
