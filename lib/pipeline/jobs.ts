// Post-upload pipeline (plan/06 6.7 step 2). Each step is one pipeline_jobs row
// and one QStash message to /api/pipeline/<route>. Steps are idempotent and
// isolated: a failed render never blocks the listing or the other renders.
//   upload -> analyze -> listing (unit goes live) -> review (advisory, never fails the unit)
//                     -> stage:<style> (one per planned render)
//        -> places (nearby cafes, needs only the location)
import { claimJob, finishJob, generateAvailability, getUnit, jobRunning, pipelineSettled, queueJobs, saveListing, setUnitStatus, uploadInputs, type UploadInputs } from "../db/store";
import { analyzeSpecs, saveKeyframesAndSpecs } from "./ingest";
import { generateListingV2, type UploadOwner } from "./specs-listing";
import { planStaging, stageOne } from "./staging";
import { reviewInputOf, reviewListing, ReviewInvalidError } from "./review";
import type { Survey } from "./survey";
import type { UseVerdict } from "./rubric";
import { spendBlocked } from "../guard";
import { publish, QSTASH_MAX_DELIVERIES, qstashEnabled } from "../qstash";
import { placesConfigured, refreshPlaces } from "../places";

// A failure that retrying cannot fix (quota, missing input): marked failed, no QStash retry.
export class PermanentError extends Error {}

export const ROUTES = ["analyze", "listing", "review", "stage", "places"] as const;
export type Route = (typeof ROUTES)[number];
export interface StepMsg { slug: string; step: string }
export const routeOf = (step: string): Route | null => {
  const r = step.split(":")[0];
  return (ROUTES as readonly string[]).includes(r) ? (r as Route) : null;
};

const ownerOf = (u: UploadInputs): UploadOwner => ({
  district: u.district, rent_egp: u.rent_egp, daily_egp: u.daily_egp,
  floor_text: u.floor_text, available_from: u.available_from, kind: u.kind,
});
function verdictsOf(u: UploadInputs): { survey: Survey; uses: UseVerdict[] } {
  const survey = u.specs?.survey as Survey | undefined; const uses = u.specs?.uses as UseVerdict[] | undefined;
  if (!survey || !uses) throw new PermanentError("analyze has not finished");
  return { survey, uses };
}

// Run one step; returns the follow-up steps to queue.
async function execute(u: UploadInputs, step: string): Promise<string[]> {
  if (await spendBlocked()) throw new PermanentError("DEMO_QUOTA");
  const route = routeOf(step);
  if (route === "analyze") {
    if (u.frames.length < 3) throw new PermanentError("not enough keyframes");
    const a = await analyzeSpecs(ownerOf(u), u.frames);
    await saveKeyframesAndSpecs(u.id, u.frames, a);
    return ["listing", ...planStaging(a.survey, a.uses).map((j) => `stage:${j.style}`)];
  }
  if (route === "listing") {
    const { uses } = verdictsOf(u);
    await saveListing(u.id, await generateListingV2(u.specs!, ownerOf(u), uses));
    await generateAvailability(u.id, u.available_from);
    await setUnitStatus(u.slug, "ready");
    return ["review"];
  }
  // Advisory proofread of the listing text: reads the unit, writes only ai_cache.
  if (route === "review") {
    const unit = await getUnit(u.slug);
    if (!unit || !unit.title_en || !unit.summary_en) throw new PermanentError("listing has not finished");
    try { await reviewListing(reviewInputOf(unit)); }
    catch (e) { if (e instanceof ReviewInvalidError) throw new PermanentError(e.message); throw e; }
    return [];
  }
  if (route === "stage") {
    const { survey, uses } = verdictsOf(u);
    const job = planStaging(survey, uses).find((j) => `stage:${j.style}` === step);
    if (!job) throw new PermanentError("STYLE_NOT_IN_PLAN");
    await stageOne({ id: u.id, slug: u.slug, kind: u.kind }, job);
    return [];
  }
  if (route === "places") {
    if (u.lat === null || u.lng === null) throw new PermanentError("unit has no location");
    if (!placesConfigured()) throw new PermanentError("PLACES_NOT_CONFIGURED");
    await refreshPlaces(u.id, { lat: u.lat, lng: u.lng });
    return [];
  }
  throw new PermanentError(`unknown step ${step}`);
}

// busy: another run holds the step (claimed less than STUCK_MINUTES ago). The route answers
// 503 so QStash delivers again later: if that run died, the later delivery reclaims it.
export type RunResult = "done" | "skipped" | "busy" | "failed" | "failed_permanent";

// WhatsApp listing drafts (plan/08 8.1): tell the owner once everything is in (listing live
// and every step, incl. review and the staged renders, finished: done or failed for good), or when
// analyze/listing failed for good (permanent, no QStash retry locally, or QStash's last
// delivery). A failure with a retry still coming notifies nothing. Checked after the
// follow-up steps are queued, so "nothing pending" really means the end. Best effort; never
// throws here; the draft's compare-and-set status makes it one message even if two steps race.
async function notifyOwner(slug: string, outcome: "ready" | "failed"): Promise<void> {
  try { await (await import("../wa-listing")).notifyDraftPipeline(slug, outcome); } catch { /* best effort */ }
}
async function notifyIfSettled(unitId: string, slug: string): Promise<void> {
  try { if (await pipelineSettled(unitId, qstashEnabled() ? QSTASH_MAX_DELIVERIES : 0)) await notifyOwner(slug, "ready"); } catch { /* best effort */ }
}

// Claim -> execute -> record. Throws nothing: the route maps "failed" to a 500
// so QStash retries, and everything else to 200.
export async function runStep(slug: string, step: string): Promise<RunResult> {
  const u = await uploadInputs(slug);
  if (!u) return "failed_permanent";
  const attempts = await claimJob(u.id, step);
  if (attempts === null) return (await jobRunning(u.id, step)) ? "busy" : "skipped";
  try {
    const next = await execute(u, step);
    await finishJob(u.id, step);
    await enqueue(u.id, slug, next);
    await notifyIfSettled(u.id, slug);
    return "done";
  } catch (e) {
    const msg = (e as Error).message || "error";
    console.error(`[pipeline] ${slug} ${step}: ${msg}`);
    const permanent = e instanceof PermanentError;
    await finishJob(u.id, step, msg, permanent && qstashEnabled() ? QSTASH_MAX_DELIVERIES : 0); // permanent: no retry to wait for
    if (step === "analyze" || step === "listing") await setUnitStatus(slug, "failed").catch(() => {});
    // Final: no retry follows (permanent, local in-process run, or QStash's last delivery).
    // attempts counts every claim of this row, so a stuck-run reclaim also counts as one.
    const final = permanent || !qstashEnabled() || attempts >= QSTASH_MAX_DELIVERIES;
    if (final && (step === "analyze" || step === "listing")) await notifyOwner(slug, "failed");
    else if (final) await notifyIfSettled(u.id, slug); // a failed review/render still ends in one "ready" notice
    return permanent ? "failed_permanent" : "failed";
  }
}

// Queue rows, then deliver: QStash on Vercel, in-process locally (no automatic
// retries locally; use the retry button on the edit page).
export async function enqueue(unitId: string, slug: string, steps: string[]): Promise<void> {
  if (!steps.length) return;
  await queueJobs(unitId, steps);
  for (const step of steps) {
    const route = routeOf(step);
    if (!route) continue;
    const msg: StepMsg = { slug, step };
    if (qstashEnabled()) await publish(`/api/pipeline/${route}`, msg);
    else void runStep(slug, step);
  }
}
