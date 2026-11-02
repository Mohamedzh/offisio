// Owner spec edits: the only fields SpecsEditForm may change, with ranges.
// Shared by the specs route (validates before any write), the demo preview
// cookie (re-validated on every read, never trusted as-is) and the form
// (enum lists). Pure: safe in Server and Client Components.
import type { T, TranslationKey } from "./i18n";

export type SpecsEdit = Partial<{
  area_m2_estimate: number | null;
  desk_capacity: number | null;
  windows_count: number | null;
  condition: string | null;
  natural_light: string | null;
  flooring: string | null;
  notes_ar: string | null;
  has_ac: boolean | null;
  ac_units_visible: number | null;
}>;

// Enums match SPECS_PROMPT_V1 (lib/meta/prompts.ts). Stored values stay English;
// labels come from the dictionaries ("enum.<field>.<value>").
export const ENUMS = {
  condition: ["excellent", "good", "needs_paint", "needs_work"],
  natural_light: ["bright", "moderate", "dim"],
  flooring: ["tile", "wood", "carpet", "concrete", "unknown"],
} as const;
export type EnumField = keyof typeof ENUMS;
export const NOTES_MAX = 500;

// Localized label for a stored enum value; unknown values show as-is.
export function enumLabel(t: T, field: EnumField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const v = String(value);
  return (ENUMS[field] as readonly string[]).includes(v) ? t(`enum.${field}.${v}` as TranslationKey) : v;
}

type Check = (v: unknown) => boolean;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const range = (min: number, max: number, int: boolean): Check => (v) =>
  v === null || (isNum(v) && v >= min && v <= max && (!int || Number.isInteger(v)));
const oneOf = (list: readonly string[]): Check => (v) => v === null || (typeof v === "string" && list.includes(v));

const RULES: Record<keyof SpecsEdit, Check> = {
  area_m2_estimate: range(5, 2000, false),
  desk_capacity: range(0, 500, true),
  windows_count: range(0, 100, true),
  ac_units_visible: range(0, 50, true),
  condition: oneOf(ENUMS.condition),
  natural_light: oneOf(ENUMS.natural_light),
  flooring: oneOf(ENUMS.flooring),
  notes_ar: (v) => v === null || (typeof v === "string" && v.length <= NOTES_MAX),
  has_ac: (v) => v === null || typeof v === "boolean",
};

// C0/C1 control characters (newlines, NUL, escapes) never reach storage.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const clean = (k: string, v: unknown) => (k === "notes_ar" && typeof v === "string" ? v.replace(CONTROL, "") || null : v);

export type SpecsEditResult = { ok: true; specs: SpecsEdit } | { ok: false; error: string };

// Unknown keys and out-of-range values are rejected, never dropped silently.
export function validateSpecsEdit(input: unknown): SpecsEditResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "SPECS_INVALID" };
  const entries = Object.entries(input);
  if (!entries.length) return { ok: false, error: "SPECS_INVALID" };
  const cleaned = entries.map(([k, v]) => [k, clean(k, v)] as const); // checks run on the stored form
  for (const [k, v] of cleaned) {
    if (!Object.hasOwn(RULES, k)) return { ok: false, error: "SPECS_UNKNOWN_FIELD" };
    if (!RULES[k as keyof SpecsEdit](v)) return { ok: false, error: "SPECS_INVALID" };
  }
  return { ok: true, specs: Object.fromEntries(cleaned) as SpecsEdit };
}

// --- Demo preview cookie: one per visitor, the latest previewed unit only ---
// (Encoding lives server-side in lib/demo-units.ts; it uses Buffer.)
export const PREVIEW_COOKIE = "offisio_preview";
export const PREVIEW_MAX_AGE = 60 * 60 * 24; // 1 day
export const PREVIEW_MAX_CHARS = 3000; // encoded value; stays well under the 4 KB cookie cap
export type Preview = { slug: string; specs: SpecsEdit };
