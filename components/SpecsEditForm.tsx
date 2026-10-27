"use client";
import { useState } from "react";
import { getT, type Locale } from "@/lib/i18n";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v));
const parseNum = (v: string) => (v.trim() === "" ? null : Number(v));

export default function SpecsEditForm({ slug, specs, locale }: { slug: string; specs: Record<string, unknown>; locale: Locale }) {
  const t = getT(locale);
  const [area, setArea] = useState(num(specs.area_m2_estimate));
  const [desks, setDesks] = useState(num(specs.desk_capacity));
  const [windows, setWindows] = useState(num(specs.windows_count));
  const [condition, setCondition] = useState(String(specs.condition ?? ""));
  const [light, setLight] = useState(String(specs.natural_light ?? ""));
  const [flooring, setFlooring] = useState(String(specs.flooring ?? ""));
  const [notes, setNotes] = useState(String(specs.notes_ar ?? ""));
  const [hasAc, setHasAc] = useState(specs.has_ac === true);
  const [acUnits, setAcUnits] = useState(num(specs.ac_units_visible));
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/units/specs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, specs: {
          area_m2_estimate: parseNum(area), desk_capacity: parseNum(desks), windows_count: parseNum(windows),
          condition: condition || null, natural_light: light || null, flooring: flooring || null,
          notes_ar: notes || null, has_ac: hasAc, ac_units_visible: parseNum(acUnits),
        } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(t("edit.saved"));
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const inputCls = "mt-1 w-full rounded-none border border-ink bg-sheet p-2 focus:outline-none focus:ring-2 focus:ring-chalk focus:ring-offset-1";
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">{t("spec.area")}<input type="number" min={0} step="0.1" value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.deskCapacity")}<input type="number" min={0} value={desks} onChange={(e) => setDesks(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.windows")}<input type="number" min={0} value={windows} onChange={(e) => setWindows(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.acUnits")}<input type="number" min={0} value={acUnits} onChange={(e) => setAcUnits(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.condition")}
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
            <option value="">—</option><option value="excellent">excellent</option><option value="good">good</option><option value="needs_paint">needs_paint</option><option value="needs_work">needs_work</option>
          </select></label>
        <label className="block text-sm">{t("spec.naturalLight")}
          <select value={light} onChange={(e) => setLight(e.target.value)} className={inputCls}>
            <option value="">—</option><option value="bright">bright</option><option value="moderate">moderate</option><option value="dim">dim</option>
          </select></label>
        <label className="block text-sm">{t("spec.flooring")}
          <select value={flooring} onChange={(e) => setFlooring(e.target.value)} className={inputCls}>
            <option value="">—</option><option value="tile">tile</option><option value="wood">wood</option><option value="carpet">carpet</option><option value="concrete">concrete</option><option value="unknown">unknown</option>
          </select></label>
        <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={hasAc} onChange={(e) => setHasAc(e.target.checked)} />{t("spec.hasAc")}</label>
      </div>
      <label className="block text-sm">{t("spec.notes")}<input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></label>
      <p className="text-xs text-ink/75">{t("edit.note")}</p>
      {msg && <p className="text-sm font-bold text-ink">{msg}</p>}
      <button disabled={busy} onClick={save} className="bg-brick text-white font-bold uppercase px-5 py-2.5 disabled:opacity-40">{t("edit.save")}</button>
    </div>
  );
}
