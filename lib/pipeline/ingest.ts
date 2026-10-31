// Unit analysis (docs/RUBRIC.md): frames -> survey -> RUBRIC_V1 verdicts ->
// derived specs -> listing v2. Shared by the live upload route and the seeding
// scripts. Every model step is cached by content, so re-runs are free.
import { runSurvey, type Frame, type Survey } from "./survey";
import { assess, deriveSpecs, area, type UseVerdict } from "./rubric";
import { generateListingV2, type Listing, type UploadOwner } from "./specs-listing";
import { replaceKeyframes, saveListing, saveSpecs } from "../db/store";

export interface Analysis { survey: Survey; uses: UseVerdict[]; specs: Record<string, unknown>; listing: Listing; heroIndex: number }

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch frame failed: ${r.status}`);
  return `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}

// Hero = best frame of the largest usable room, else the first frame.
function heroOf(survey: Survey): number {
  const rooms = survey.spaces.filter((s) => s.type === "room" || s.type === "other").sort((a, b) => (area(b) ?? 0) - (area(a) ?? 0));
  return (rooms[0] ?? survey.spaces[0]).best_frame ?? 0;
}

// `given` skips the model survey: synthetic units pass the survey built from
// their own floor-plan brief (independent generated frames fool a survey).
export async function analyzeUnit(owner: UploadOwner, frames: Frame[], given?: Survey): Promise<Analysis> {
  const a = await analyzeSpecs(owner, frames, given);
  return { ...a, listing: await generateListingV2(a.specs, owner, a.uses) };
}

// Survey + rubric + specs only (the pipeline `analyze` step; `listing` runs separately).
export async function analyzeSpecs(owner: UploadOwner, frames: Frame[], given?: Survey): Promise<Omit<Analysis, "listing">> {
  const survey = given ?? await runSurvey(
    await Promise.all(frames.map(async (f) => ({ url: await toDataUrl(f.url), t: f.t }))),
    `Owner fields: district=${owner.district}, floors=${owner.floor_text}, kind=${owner.kind}.`);
  const uses = assess(survey, owner.kind);
  const specs = { ...deriveSpecs(survey, uses), survey, uses, survey_source: given ? "brief" : "model" };
  return { survey, uses, specs, heroIndex: heroOf(survey) };
}

// Persist: keyframes (with timestamp, spaces, hero) + specs + listing.
export async function saveAnalysis(unitId: string, frames: Frame[], a: Analysis, extraMeta: Record<string, unknown> = {}): Promise<void> {
  await saveKeyframesAndSpecs(unitId, frames, a, extraMeta);
  await saveListing(unitId, a.listing);
}

export async function saveKeyframesAndSpecs(unitId: string, frames: Frame[], a: Omit<Analysis, "listing">, extraMeta: Record<string, unknown> = {}): Promise<void> {
  const spacesFor = (i: number) => a.survey.spaces.filter((s) => s.frames.includes(i)).map((s) => s.id);
  const bestFor = (i: number) => a.survey.spaces.filter((s) => s.best_frame === i).map((s) => s.id);
  await replaceKeyframes(unitId, frames.map((f, i) => ({
    url: f.url,
    meta: { ...extraMeta, t: f.t, frame: i, spaces: spacesFor(i), best_for: bestFor(i), ...(i === a.heroIndex ? { hero: true } : {}) },
  })));
  await saveSpecs(unitId, a.specs);
}
