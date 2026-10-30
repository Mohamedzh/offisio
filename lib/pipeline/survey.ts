// Space survey (docs/RUBRIC.md stage 1): walkthrough frames -> validated list
// of distinct spaces. Non-PII product data -> meta.nonPii; cached by content.
import { meta, nonPiiModel } from "../meta/client";
import { SURVEY_PROMPT_V1 } from "../meta/prompts";
import { cached } from "./cache";

export const SPACE_TYPES = ["entrance", "corridor", "room", "bathroom", "kitchenette", "storage", "balcony", "other"] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];
export interface Space {
  id: string; type: SpaceType; label_en: string;
  frames: number[]; best_frame: number;
  width_m: number | null; length_m: number | null; dims_confidence: number;
  windows: number | null; natural_light: "bright" | "moderate" | "dim" | null;
  plumbing: { wc: boolean | null; sink: boolean | null; water_stub: boolean | null; drain: boolean | null };
  finish: "finished" | "semifinished" | "bare" | null; furnished: boolean; notes: string | null;
}
export interface Survey {
  spaces: Space[]; adjacency: [string, string][]; entrance_space: string | null;
  has_ac: boolean | null; ac_units_visible: number | null;
  flooring: "tile" | "wood" | "carpet" | "concrete" | "unknown" | null;
  condition: "excellent" | "good" | "needs_paint" | "needs_work" | null; condition_confidence: number;
  notes_ar: string | null;
}
export interface Frame { url: string; t: number }

const num = (v: unknown, min = 0, max = 1e4) => v === null || v === undefined ? null : typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : NaN;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (v === null || v === undefined ? null : allowed.includes(v as T) ? (v as T) : (() => { throw new Error(`bad enum ${String(v)}`); })());
const boolOrNull = (v: unknown) => (v === null || v === undefined ? null : typeof v === "boolean" ? v : (() => { throw new Error("bad bool"); })());

// Validate + normalise model output; frame indexes must exist.
export function validateSurvey(raw: unknown, frameCount: number): Survey {
  if (!raw || typeof raw !== "object") throw new Error("survey is not an object");
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.spaces) || !r.spaces.length) throw new Error("survey.spaces empty");
  const ids = new Set<string>();
  const spaces = r.spaces.map((x, i): Space => {
    const s = x as Record<string, unknown>;
    const id = typeof s.id === "string" && s.id ? s.id : `s${i + 1}`;
    if (ids.has(id)) throw new Error(`duplicate space id ${id}`);
    ids.add(id);
    const frames = Array.isArray(s.frames) ? s.frames.filter((f): f is number => Number.isInteger(f) && f >= 0 && f < frameCount) : [];
    const best = Number.isInteger(s.best_frame) && (s.best_frame as number) >= 0 && (s.best_frame as number) < frameCount ? (s.best_frame as number) : frames[0];
    if (best === undefined) throw new Error(`space ${id} has no valid frame`);
    const w = num(s.width_m, 0.3, 60); const l = num(s.length_m, 0.3, 60);
    if (Number.isNaN(w) || Number.isNaN(l)) throw new Error(`space ${id} dims invalid`);
    const pl = (s.plumbing ?? {}) as Record<string, unknown>;
    const win = num(s.windows, 0, 50);
    return {
      id, type: oneOf(s.type, SPACE_TYPES) ?? "other", label_en: typeof s.label_en === "string" ? s.label_en : String(s.type),
      frames: frames.length ? frames : [best], best_frame: best,
      width_m: w, length_m: l, dims_confidence: Math.min(1, Math.max(0, Number(s.dims_confidence) || 0)),
      windows: Number.isNaN(win) ? null : (win as number | null), natural_light: oneOf(s.natural_light, ["bright", "moderate", "dim"] as const),
      plumbing: { wc: boolOrNull(pl.wc), sink: boolOrNull(pl.sink), water_stub: boolOrNull(pl.water_stub), drain: boolOrNull(pl.drain) },
      finish: oneOf(s.finish, ["finished", "semifinished", "bare"] as const), furnished: s.furnished === true,
      notes: typeof s.notes === "string" ? s.notes : null,
    };
  });
  const adjacency = (Array.isArray(r.adjacency) ? r.adjacency : [])
    .filter((p): p is [string, string] => Array.isArray(p) && p.length === 2 && ids.has(p[0]) && ids.has(p[1]));
  const ac = num(r.ac_units_visible, 0, 50);
  return {
    spaces, adjacency,
    entrance_space: typeof r.entrance_space === "string" && ids.has(r.entrance_space) ? r.entrance_space : null,
    has_ac: boolOrNull(r.has_ac), ac_units_visible: Number.isNaN(ac) ? null : (ac as number | null),
    flooring: oneOf(r.flooring, ["tile", "wood", "carpet", "concrete", "unknown"] as const),
    condition: oneOf(r.condition, ["excellent", "good", "needs_paint", "needs_work"] as const),
    condition_confidence: Math.min(1, Math.max(0, Number(r.condition_confidence) || 0)),
    notes_ar: typeof r.notes_ar === "string" ? r.notes_ar : null,
  };
}

const parseJson = (t: string): unknown => JSON.parse(t.replace(/^```json\s*|\s*```$/g, "").trim());

// frames[i].url may be an https URL or a data: URL. One validation-feedback retry.
export async function runSurvey(frames: Frame[], ownerContext: string): Promise<Survey> {
  const content: unknown[] = [{ type: "text", text: `${ownerContext}\n${frames.length} frames follow in walk order.` }];
  frames.forEach((f, i) => {
    content.push({ type: "text", text: `frame ${i} t=${f.t.toFixed(1)}s` });
    content.push({ type: "image_url", image_url: { url: f.url } });
  });
  const messages = [{ role: "system", content: SURVEY_PROMPT_V1 }, { role: "user", content }];
  return cached("survey", nonPiiModel(), "SURVEY_PROMPT_V1", [SURVEY_PROMPT_V1, ...frames.map((f) => f.url), ownerContext], async () => {
    let err = "";
    for (let i = 0; i < 2; i++) {
      const r = (await meta.nonPii.chat({
        messages: err ? [...messages, { role: "user", content: `Previous reply failed validation: ${err}. Reply with valid JSON only.` }] : messages,
        temperature: 0.1, max_tokens: 12000,
      })) as { choices?: { message?: { content?: string } }[] };
      try {
        const c = r.choices?.[0]?.message?.content;
        if (!c) throw new Error("empty model reply");
        return validateSurvey(parseJson(c), frames.length);
      } catch (e) { err = (e as Error).message; }
    }
    throw new Error("survey validation failed twice: " + err);
  });
}
