"use client";
// Renders missing fit-out concepts for a unit, one style per click (plan/06 O1).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorText, getT, type Locale, type TranslationKey } from "@/lib/i18n";

export default function StageButtons({ slug, styles, locale }: { slug: string; styles: string[]; locale: Locale }) {
  const router = useRouter(); const t = getT(locale);
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState("");
  async function render(style: string) {
    setBusy(style); setMsg("");
    const res = await fetch(`/api/units/${slug}/stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ style }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg(errorText(t, data.error ?? "upload.failed")); return; }
    router.refresh();
  }
  if (!styles.length) return null;
  return (
    <div className="mt-4 border border-ink bg-sheet p-3">
      <p className="text-sm font-bold">{t("stage.title")}</p>
      <p className="text-xs text-ink/75 mt-1">{t("stage.note")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {styles.map((s) => (
          <button key={s} disabled={!!busy} onClick={() => render(s)} className="px-3 py-1.5 text-sm border border-ink font-bold bg-brick text-white disabled:opacity-40">
            {busy === s ? t("stage.rendering") : t(`viewer.style.${s}` as TranslationKey)}
          </button>
        ))}
      </div>
      {msg && <p className="text-sm font-bold text-brick mt-2">{msg}</p>}
    </div>
  );
}
