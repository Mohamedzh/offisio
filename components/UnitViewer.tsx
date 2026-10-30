"use client";
import { useState } from "react";
import Image from "next/image";
import { getT, type Locale, type TranslationKey } from "@/lib/i18n";

type Images = { real: string; empty: string | null; staged: { style: string; url: string }[] };

export default function UnitViewer({ images, locale, synthetic = false }: { images: Images; locale: Locale; synthetic?: boolean }) {
  const t = getT(locale);
  const views = [
    { key: "real", label: t(synthetic ? "viewer.realSynthetic" : "viewer.real"), src: images.real },
    ...(images.empty ? [{ key: "empty", label: t("viewer.empty"), src: images.empty }] : []),
    ...images.staged.map((s) => ({ key: s.style, label: t(`viewer.style.${s.style}` as TranslationKey), src: s.url })),
  ].filter((v) => v.src);
  const [active, setActive] = useState(views[0]);
  // Layer under the tear: the emptied room on load, else the first fit concept.
  const [prev, setPrev] = useState(() => views.find((v) => v.key === "empty") ?? views[1] ?? views[0]);
  const under = prev && prev.key !== active.key ? prev : null; // no layer beneath -> no tear
  function pick(v: (typeof views)[number]) { setPrev(active); setActive(v); }
  return (
    <div>
      <div className="relative aspect-[4/5] sm:aspect-[16/10] overflow-hidden border border-ink bg-torn">
        {under && <Image src={under.src} alt="" fill className="object-cover" sizes="100vw" />}
        <Image key={active.key} src={active.src} alt={active.label} fill className={`object-cover ${under ? "tear-layer" : ""}`} sizes="100vw" priority />
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
