"use client";
import { useState } from "react";
import Image from "next/image";

export default function UnitViewer({ images, en }: { images: { real: string; empty: string | null; fits: Record<string, string> }; en: boolean }) {
  const views = [
    { key: "real", label: en ? "Real today" : "الحقيقي دلوقتي", src: images.real },
    ...(images.empty ? [{ key: "empty", label: en ? "Emptied by AI" : "فاضي بالذكاء الاصطناعي", src: images.empty }] : []),
    { key: "startup", label: en ? "Fit: Startup" : "تجهيز: ستارت أب", src: images.fits.startup },
    { key: "clinic", label: en ? "Fit: Clinic" : "تجهيز: عيادة", src: images.fits.clinic },
    { key: "training", label: en ? "Fit: Training" : "تجهيز: تدريب", src: images.fits.training },
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
      <p className="mt-2 text-xs text-zinc-500">{en ? "Fit renders are AI concepts from the real room — not the current state." : "صور التجهيز تصور بالذكاء الاصطناعي من الغرفة الحقيقية — مش الحالة الحالية."}</p>
    </div>
  );
}
