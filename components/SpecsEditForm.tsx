"use client";
import { useRef, useState } from "react";
import { errorText, getT, type Locale } from "@/lib/i18n";
import { ENUMS, enumLabel, NOTES_MAX, type EnumField } from "@/lib/specs-edit";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v));
const parseNum = (v: string) => (v.trim() === "" ? null : Number(v));
const NUMERIC = new Set(["area_m2_estimate", "desk_capacity", "windows_count", "ac_units_visible"]);

export default function SpecsEditForm({ slug, specs, locale, demo = false }: { slug: string; specs: Record<string, unknown>; locale: Locale; demo?: boolean }) {
  const t = getT(locale);
  const box = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState(num(specs.area_m2_estimate));
  const [desks, setDesks] = useState(num(specs.desk_capacity));
  const [windows, setWindows] = useState(num(specs.windows_count));
  const [condition, setCondition] = useState(String(specs.condition ?? ""));
  const [light, setLight] = useState(String(specs.natural_light ?? ""));
  const [flooring, setFlooring] = useState(String(specs.flooring ?? ""));
  const [notes, setNotes] = useState(String(specs.notes_ar ?? ""));
  const [hasAc, setHasAc] = useState(specs.has_ac === true);
  const [acTouched, setAcTouched] = useState(false); // has_ac is sent only when the owner changed it
  const [acUnits, setAcUnits] = useState(num(specs.ac_units_visible));
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  // Only fields the owner changed are sent and checked, so one odd stored
  // value (e.g. model-written notes or area) never blocks saving the rest.
  function changes(): { specs: Record<string, unknown>; invalid?: HTMLInputElement } {
    const text: [string, string, unknown][] = [
      ["area_m2_estimate", area, specs.area_m2_estimate], ["desk_capacity", desks, specs.desk_capacity],
      ["windows_count", windows, specs.windows_count], ["ac_units_visible", acUnits, specs.ac_units_visible],
      ["condition", condition, specs.condition], ["natural_light", light, specs.natural_light],
      ["flooring", flooring, specs.flooring], ["notes_ar", notes, specs.notes_ar],
    ];
    const out: Record<string, unknown> = {};
    for (const [key, now, was] of text) {
      if (now === num(was)) continue;
      const input = box.current?.querySelector<HTMLInputElement>(`input[name="${key}"]`);
      const value = NUMERIC.has(key) ? parseNum(now) : now.trim() || null;
      if ((input && !input.checkValidity()) || Number.isNaN(value)) return { specs: out, invalid: input ?? undefined };
      out[key] = value;
    }
    if (acTouched && hasAc !== (specs.has_ac === true)) out.has_ac = hasAc;
    return { specs: out };
  }

  async function save() {
    setMsg("");
    const { specs: changed, invalid } = changes();
    if (invalid) {
      // Our own message: the browser's bubble follows the browser language, not the page.
      invalid.setCustomValidity(invalid.validity.stepMismatch ? t("form.wholeNumber") : t("form.range", { min: invalid.min, max: invalid.max }));
      invalid.addEventListener("input", () => invalid.setCustomValidity(""), { once: true });
      invalid.reportValidity(); setMsg(errorText(t, "SPECS_INVALID")); return;
    }
    if (!Object.keys(changed).length) { setMsg(t("edit.nothingToSave")); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/units/specs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, specs: changed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(errorText(t, data.error ?? "upload.failed"));
      setMsg(t(data.preview ? "demo.previewSaved" : "edit.saved"));
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const inputCls = "field mt-1";
  const select = (field: EnumField, value: string, set: (v: string) => void) => (
    <select value={value} onChange={(e) => set(e.target.value)} className={inputCls}>
      <option value="">—</option>
      {ENUMS[field].map((v) => <option key={v} value={v}>{enumLabel(t, field, v)}</option>)}
    </select>
  );
  return (
    <div ref={box} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">{t("spec.area")}<input name="area_m2_estimate" type="number" min={5} max={2000} step="any" value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.deskCapacity")}<input name="desk_capacity" type="number" min={0} max={500} step={1} value={desks} onChange={(e) => setDesks(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.windows")}<input name="windows_count" type="number" min={0} max={100} step={1} value={windows} onChange={(e) => setWindows(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.acUnits")}<input name="ac_units_visible" type="number" min={0} max={50} step={1} value={acUnits} onChange={(e) => setAcUnits(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("spec.condition")}{select("condition", condition, setCondition)}</label>
        <label className="block text-sm">{t("spec.naturalLight")}{select("natural_light", light, setLight)}</label>
        <label className="block text-sm">{t("spec.flooring")}{select("flooring", flooring, setFlooring)}</label>
        <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" className="size-4 accent-brick" checked={hasAc} onChange={(e) => { setHasAc(e.target.checked); setAcTouched(true); }} />{t("spec.hasAc")}</label>
      </div>
      <label className="block text-sm">{t("spec.notes")}<input name="notes_ar" value={notes} maxLength={NOTES_MAX} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></label>
      {!demo && <p className="text-xs text-ink/75">{t("edit.note")}</p>}
      {msg && <p className="text-sm font-bold text-ink">{msg}</p>}
      <button disabled={busy} onClick={save} className="btn btn-brick btn-md">{t("edit.save")}</button>
    </div>
  );
}
