// "Book on WhatsApp" entry point for renter pages (6.8): the same booking agent
// answers on WhatsApp. Server Component: the number is read server-side and only
// the wa.me link reaches the page. Renders nothing when WHATSAPP_NUMBER is unset.
import { getT, type Locale } from "@/lib/i18n";
import { waChatUrl } from "@/lib/whatsapp";
import WhatsAppFloat from "./WhatsAppFloat";

// Prefill in the page language; on a unit page it names the unit.
export function renterWaUrl(locale: Locale, unitTitle?: string): string | null {
  const t = getT(locale);
  return waChatUrl(unitTitle ? t("wa.prefillUnit", { title: unitTitle }) : t("wa.prefill"));
}

// Our own speech-bubble glyph (not WhatsApp's logo).
function ChatGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M4 5h16v11H10l-5 4v-4H4z" />
      <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" strokeLinecap="round" strokeWidth="2.6" />
    </svg>
  );
}

interface Props { href: string | null; locale: Locale; variant?: "float" | "inline" }

export default function WhatsAppButton({ href, locale, variant = "float" }: Props) {
  if (!href) return null;
  const t = getT(locale);
  const link = (cls: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={t("wa.aria")} className={cls}>
      <ChatGlyph />
      <span>{t("wa.button")}</span>
    </a>
  );
  if (variant === "inline") return link("btn btn-paper btn-sm gap-1.5");
  return (
    <>
      {/* Spacer so the fixed button never covers the last row of the page (footer links). */}
      <div aria-hidden className="h-20" />
      <WhatsAppFloat href={href} aria-label={t("wa.aria")} className="btn btn-ink fixed bottom-4 end-4 z-40 gap-2 px-4 py-3 text-sm shadow-[3px_3px_0_var(--color-brick)] max-[399px]:px-3">
        <ChatGlyph />
        <span className="max-[399px]:sr-only">{t("wa.button")}</span>
      </WhatsAppFloat>
    </>
  );
}
