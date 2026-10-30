"use client";
import { useState } from "react";
import Image from "next/image";
import { getT, type Locale, type TranslationKey } from "@/lib/i18n";
import { fitGroups } from "@/lib/fit-groups";

type Images = { real: string; empty: string | null; staged: { style: string; url: string }[] };
type Shot = { src: string; label: string };
type View = { key: string; label: string; shots: Shot[] };

export default function UnitViewer({ images, locale, synthetic = false }: { images: Images; locale: Locale; synthetic?: boolean }) {
  const t = getT(locale);
  const one = (key: string, label: string, src: string | null): View[] => (src ? [{ key, label, shots: [{ src, label }] }] : []);
  // One tab per use; a clinic tab holds its waiting + exam (+ prep) renders together.
  const views: View[] = [
    ...one("real", t(synthetic ? "viewer.realSynthetic" : "viewer.real"), images.real),
    ...one("empty", t("viewer.empty"), images.empty),
    ...fitGroups(images.staged).map((g) => {
      const label = t(g.label as TranslationKey);
      return { key: g.key, label, shots: g.items.map((i) => ({ src: i.url, label: i.part ? `${label} · ${t(`viewer.part.${i.part}` as TranslationKey)}` : label })) };
    }),
  ];
  const [active, setActive] = useState({ view: 0, shot: 0 });
  // Layer under the tear: the emptied room on load, else the next view.
  const [prev, setPrev] = useState<Shot | null>(() => (views.find((v) => v.key === "empty") ?? views[1])?.shots[0] ?? null);
  const view = views[active.view]; const shot = view.shots[active.shot];
  const under = prev && prev.src !== shot.src ? prev : null; // no layer beneath -> no tear
  function pick(v: number, s = 0) { setPrev(shot); setActive({ view: v, shot: s }); }
  const btn = (on: boolean) => `px-3 py-1.5 text-sm border border-ink font-bold ${on ? "bg-ink text-sheet" : "bg-sheet text-ink"}`;
  return (
    <div>
      <div className="relative aspect-[4/5] sm:aspect-[16/10] overflow-hidden border border-ink bg-torn">
        {under && <Image src={under.src} alt="" fill className="object-cover" sizes="100vw" />}
        <Image key={shot.src} src={shot.src} alt={shot.label} fill className={`object-cover ${under ? "tear-layer" : ""}`} sizes="100vw" priority />
        <span className="absolute bottom-3 start-3 bg-ink text-sheet px-2 py-0.5 text-[11px] uppercase tracking-wide">{shot.label}</span>
      </div>
      <div className="torn-b" aria-hidden />
      <div className="mt-3 flex flex-wrap gap-2">
        {views.map((v, i) => <button key={v.key} onClick={() => pick(i)} className={btn(active.view === i)}>{v.label}</button>)}
      </div>
      {view.shots.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-s-4 border-ink ps-3">
          {view.shots.map((s, i) => (
            <button key={s.src} onClick={() => pick(active.view, i)} className={`${btn(active.shot === i)} text-xs`}>{s.label.split(" · ")[1]}</button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-ink/75">{t("viewer.fitNote")}</p>
    </div>
  );
}
