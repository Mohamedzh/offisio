"use client";
// Slim notice on a demo unit when this visitor has previewed spec edits.
// Reset clears the httpOnly preview cookie server-side, then re-renders.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getT, type Locale } from "@/lib/i18n";

export default function SpecsPreviewBar({ slug, locale, demo = true }: { slug: string; locale: Locale; demo?: boolean }) {
  const router = useRouter(); const t = getT(locale);
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    await fetch("/api/units/specs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-ink bg-mustard/40 px-3 py-2 text-sm">
      <p>{t(demo ? "demo.previewBar" : "preview.bar")}</p>
      <button type="button" disabled={busy} onClick={reset} className="btn btn-paper btn-sm">{t("demo.reset")}</button>
    </div>
  );
}
