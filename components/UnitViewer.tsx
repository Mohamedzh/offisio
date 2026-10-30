"use client";
import { useState } from "react";
import Image from "next/image";
import { getT, type Locale, type TranslationKey } from "@/lib/i18n";

type Images = { real: string; empty: string | null; staged: { style: string; url: string }[] };

export default function UnitViewer({ images, locale }: { images: Images; locale: Locale }) {
  const t = getT(locale);
  const views = [
    { key: "real", label: t("viewer.real"), src: images.real },
    ...(images.empty ? [{ key: "empty", label: t("viewer.empty"), src: images.empty }] : []),
    ...images.staged.map((s) => ({ key: s.style, label: t(`viewer.style.${s.style}` as TranslationKey), src: s.url })),
  ].filter((v) => v.src);
  const [active, setActive] = useState(views[0]);
  const [prev, setPrev] = useState(() => views.find((v) => v.key === "empty") ?? views[0]);
  function pick(v: (typeof views)[number]) { setPrev(active); setActive(v); }
  return (
    <div>
      <div className="relative aspect-[4/5] sm:aspect-[16/10] overflow-hidden border border-ink bg-torn">
        {prev && prev.key !== active.key && <Image src={prev.src} alt="" fill className="object-cover" sizes="100vw" />}
        <Image key={active.key} src={active.src} alt={active.label} fill className="object-cover tear-layer" sizes="100vw" priority />
        <div className="tear-seam absolute inset-x-0 bottom-[5%] pointer-events-none" aria-hidden />
        <span className="absolute bottom-3 start-3 bg-ink text-sheet px-2 py-0.5 text-[11px] uppercase tracking-wide">{active.label}</span>
      </div>
      <div className="torn-b" aria-hidden />
      <div className="mt-3 flex flex-wrap gap-2">
        {views.map((v) => (
          <button key={v.key} onClick={() => pick(v)} className={`px-3 py-1.5 text-sm border border-ink font-bold ${active.key === v.key ? "bg-ink text-sheet" : "bg-sheet text-ink"}`}>{v.label}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/75">{t("viewer.fitNote")}</p>
    </div>
  );
}
