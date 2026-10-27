"use client";
import { useState } from "react";
import Image from "next/image";
import { getT, type Locale } from "@/lib/i18n";

export default function UnitViewer({ images, locale }: { images: { real: string; empty: string | null; fits: Record<string, string> }; locale: Locale }) {
  const t = getT(locale);
  const views = [
    { key: "real", label: t("viewer.real"), src: images.real },
    ...(images.empty ? [{ key: "empty", label: t("viewer.empty"), src: images.empty }] : []),
    { key: "startup", label: t("viewer.fitStartup"), src: images.fits.startup },
    { key: "clinic", label: t("viewer.fitClinic"), src: images.fits.clinic },
    { key: "training", label: t("viewer.fitTraining"), src: images.fits.training },
  ];
  const [active, setActive] = useState(views[0]);
  return (
    <div>
      <div className="relative aspect-[4/5] sm:aspect-[16/10] overflow-hidden rounded-2xl bg-zinc-200">
        <Image src={active.src} alt={active.label} fill className="object-cover" sizes="100vw" priority />
        <span className="absolute bottom-3 start-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">{active.label}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {views.map((v) => (
          <button key={v.key} onClick={() => setActive(v)} className={`rounded-full px-3 py-1.5 text-sm border ${active.key === v.key ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white dark:bg-zinc-900"}`}>{v.label}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">{t("viewer.fitNote")}</p>
    </div>
  );
}
