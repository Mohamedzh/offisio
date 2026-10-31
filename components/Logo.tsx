import Image from "next/image";
import type { Locale } from "@/lib/i18n";

// Brand lockup from public/brand (sources + generator: scripts/brand-assets.ts).
// The drawn wordmark is Latin, so Arabic pairs the mark with Cairo-set "أوفيسيو".
export default function Logo({ locale, size = "md" }: { locale: Locale; size?: "sm" | "md" }) {
  const h = size === "sm" ? 24 : 32;
  if (locale === "ar") {
    return (
      <span className="inline-flex items-center gap-2">
        <Image src="/brand/offisio-mark.svg" alt="" width={h} height={h} priority={size === "md"} />
        <span className={`font-display font-black tracking-[-0.02em] ${size === "sm" ? "text-lg" : "text-xl sm:text-2xl"}`}>أوفيسيو</span>
      </span>
    );
  }
  return <Image src="/brand/offisio-logo.svg" alt="Offisio" width={Math.round((h * 274) / 64)} height={h} priority={size === "md"} />;
}
