// Specs (S3) + listing (S4) pipeline steps — reusable server-side code.
// Non-PII product data: calls go through meta.nonPii (muse-spark-1.3; the
// contributor model only in local dev). Output is JSON-parsed and validated,
// with one validation-feedback retry. Results are cached by content hash.
import { meta, nonPiiModel } from "../meta/client";
import { cached } from "./cache";
import { SPECS_PROMPT_V1, LISTING_PROMPT_V1, LISTING_PROMPT_V2, type UnitKind } from "../meta/prompts";
import type { UseVerdict } from "./rubric";

export interface UploadOwner {
  district: string; rent_egp: number; daily_egp: number | null;
  floor_text: string; available_from: string; kind: UnitKind;
}

export interface Specs {
  area_m2_estimate: number | null;
  windows_count: number | null;
  window_orientation_hint: "street" | "courtyard" | "unknown" | null;
  has_ac: boolean | null;
  ac_units_visible: number | null;
  desk_capacity: number | null;
  condition: "excellent" | "good" | "needs_paint" | "needs_work" | null;
  flooring: "tile" | "wood" | "carpet" | "concrete" | "unknown" | null;
  natural_light: "bright" | "moderate" | "dim" | null;
  notes_ar: string | null;
  confidence: { area_m2_estimate: number; desk_capacity: number; condition: number };
  [key: string]: unknown;
}

export interface Listing {
  title_ar: string; title_en: string; summary_ar: string; summary_en: string;
  highlights_ar: string[]; highlights_en: string[];
}

const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isIntOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isInteger(v));
const inEnumOrNull = (v: unknown, allowed: string[]) => v === null || (typeof v === "string" && allowed.includes(v));

export function validateSpecs(raw: unknown): Specs {
  if (!raw || typeof raw !== "object") throw new Error("specs is not an object");
  const s = raw as Record<string, unknown>;
  for (const k of ["area_m2_estimate", "windows_count", "has_ac", "desk_capacity", "condition", "natural_light", "confidence"])
    if (!(k in s)) throw new Error(`specs missing ${k}`);
  if (!isNumOrNull(s.area_m2_estimate)) throw new Error("specs.area_m2_estimate invalid");
  if (!isIntOrNull(s.windows_count)) throw new Error("specs.windows_count invalid");
  if (!isIntOrNull(s.ac_units_visible ?? null)) throw new Error("specs.ac_units_visible invalid");
  if (!isIntOrNull(s.desk_capacity)) throw new Error("specs.desk_capacity invalid");
  if (!(s.has_ac === null || typeof s.has_ac === "boolean")) throw new Error("specs.has_ac invalid");
  if (!inEnumOrNull(s.window_orientation_hint ?? null, ["street", "courtyard", "unknown"])) throw new Error("specs.window_orientation_hint invalid");
  if (!inEnumOrNull(s.condition, ["excellent", "good", "needs_paint", "needs_work"])) throw new Error("specs.condition invalid");
  if (!inEnumOrNull(s.flooring ?? null, ["tile", "wood", "carpet", "concrete", "unknown"])) throw new Error("specs.flooring invalid");
  if (!inEnumOrNull(s.natural_light, ["bright", "moderate", "dim"])) throw new Error("specs.natural_light invalid");
  if (!(s.notes_ar === null || s.notes_ar === undefined || typeof s.notes_ar === "string")) throw new Error("specs.notes_ar invalid");
  const c = s.confidence as Record<string, unknown> | null;
  if (!c || typeof c !== "object") throw new Error("specs.confidence invalid");
  for (const k of ["area_m2_estimate", "desk_capacity", "condition"]) {
    const v = c[k];
    if (typeof v !== "number" || v < 0 || v > 1) throw new Error(`specs.confidence.${k} invalid`);
  }
  return s as Specs;
}

export function validateListing(raw: unknown): Listing {
  if (!raw || typeof raw !== "object") throw new Error("listing is not an object");
  const l = raw as Record<string, unknown>;
  for (const k of ["title_ar", "title_en", "summary_ar", "summary_en"])
    if (typeof l[k] !== "string" || !(l[k] as string).trim()) throw new Error(`listing.${k} invalid`);
  for (const k of ["highlights_ar", "highlights_en"]) {
    const v = l[k];
    if (!Array.isArray(v) || v.length < 3 || v.length > 5 || !v.every((x) => typeof x === "string" && x.trim())) throw new Error(`listing.${k} invalid`);
  }
  return l as unknown as Listing;
}

const parseJson = (t: string): unknown => JSON.parse(t.replace(/^```json\s*|\s*```$/g, "").trim());

type Msg = { role: string; content: unknown };

// One validation-feedback retry: parse/validate failures are fed back to
// the model once; a second failure throws (mirrors scripts/run-unit.ts).
async function chatJson<T>(messages: Msg[], validate: (raw: unknown) => T): Promise<T> {
  let err = "";
  for (let i = 0; i < 2; i++) {
    const r = (await meta.nonPii.chat({
      messages: err ? [...messages, { role: "user", content: `Previous reply failed validation: ${err}. Reply with valid JSON only.` }] : messages,
      temperature: 0.2,
    })) as { choices?: { message?: { content?: string } }[] };
    try {
      const content = r.choices?.[0]?.message?.content;
      if (!content) throw new Error("empty model reply");
      return validate(parseJson(content));
    } catch (e) { err = (e as Error).message; }
  }
  throw new Error("JSON validation failed twice: " + err);
}

export async function generateSpecs(frameDataUrls: string[], owner: UploadOwner): Promise<Specs> {
  const content = [
    { type: "text", text: `Owner fields: district=${owner.district}, rent_egp=${owner.rent_egp}, floors=${owner.floor_text}, available_from=${owner.available_from}, kind=${owner.kind}. Keyframes in walk order follow.` },
    ...frameDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  return cached("specs", nonPiiModel(), "SPECS_PROMPT_V1", [SPECS_PROMPT_V1, ...frameDataUrls, JSON.stringify(owner)],
    () => chatJson<Specs>([{ role: "system", content: SPECS_PROMPT_V1 }, { role: "user", content }], validateSpecs));
}

export async function generateListing(specs: Specs, owner: UploadOwner): Promise<Listing> {
  return cached("listing", nonPiiModel(), "LISTING_PROMPT_V1", [LISTING_PROMPT_V1, JSON.stringify(specs), JSON.stringify(owner)], () => chatJson<Listing>([
    { role: "system", content: LISTING_PROMPT_V1 },
    { role: "user", content: `Specs: ${JSON.stringify(specs)}\nOwner: ${JSON.stringify(owner)}` },
  ], validateListing));
}

// Listing v2: also told which uses the rubric passed (never the failing ones).
export async function generateListingV2(specs: Record<string, unknown>, owner: UploadOwner, uses: UseVerdict[]): Promise<Listing> {
  const passing = uses.filter((u) => u.verdict !== "not_suitable").map((u) => ({ use: u.use, verdict: u.verdict, reasons: u.reasons_en, capacity: u.capacity }));
  const { survey: _s, uses: _u, ...summary } = specs; void _s; void _u;
  return cached("listing", nonPiiModel(), "LISTING_PROMPT_V2", [LISTING_PROMPT_V2, JSON.stringify(summary), JSON.stringify(owner), JSON.stringify(passing)], () => chatJson<Listing>([
    { role: "system", content: LISTING_PROMPT_V2 },
    { role: "user", content: `Specs: ${JSON.stringify(summary)}\nOwner: ${JSON.stringify(owner)}\nUSES: ${JSON.stringify(passing)}` },
  ], validateListing));
}
