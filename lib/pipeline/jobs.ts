// Post-upload pipeline (plan/06 6.7 step 2). Each step is one pipeline_jobs row
// and one QStash message to /api/pipeline/<route>. Steps are idempotent and
// isolated: a failed render never blocks the listing or the other renders.
//   upload -> analyze -> listing (unit goes live)
//                     -> stage:<style> (one per planned render)
// places / menus join in 6.7 steps 4-5.
import { claimJob, finishJob, generateAvailability, queueJobs, saveListing, setUnitStatus, uploadInputs, type UploadInputs } from "../db/store";
import { analyzeSpecs, saveKeyframesAndSpecs } from "./ingest";
import { generateListingV2, type UploadOwner } from "./specs-listing";
import { planStaging, stageOne } from "./staging";
import type { Survey } from "./survey";
import type { UseVerdict } from "./rubric";
import { spendBlocked } from "../guard";
import { publish, qstashEnabled } from "../qstash";

// A failure that retrying cannot fix (quota, missing input): marked failed, no QStash retry.
export class PermanentError extends Error {}

export const ROUTES = ["analyze", "listing", "stage"] as const;
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
    return [];
  }
  if (route === "stage") {
    const { survey, uses } = verdictsOf(u);
    const job = planStaging(survey, uses).find((j) => `stage:${j.style}` === step);
    if (!job) throw new PermanentError("STYLE_NOT_IN_PLAN");
    await stageOne({ id: u.id, slug: u.slug, kind: u.kind }, job);
    return [];
  }
  throw new PermanentError(`unknown step ${step}`);
}

export type RunResult = "done" | "skipped" | "failed" | "failed_permanent";

// Claim -> execute -> record. Throws nothing: the route maps "failed" to a 500
// so QStash retries, and everything else to 200.
export async function runStep(slug: string, step: string): Promise<RunResult> {
  const u = await uploadInputs(slug);
  if (!u) return "failed_permanent";
  if ((await claimJob(u.id, step)) === null) return "skipped";
  try {
    const next = await execute(u, step);
    await finishJob(u.id, step);
    await enqueue(u.id, slug, next);
    return "done";
  } catch (e) {
    const msg = (e as Error).message || "error";
    console.error(`[pipeline] ${slug} ${step}: ${msg}`);
    await finishJob(u.id, step, msg);
    if (step === "analyze" || step === "listing") await setUnitStatus(slug, "failed").catch(() => {});
    return e instanceof PermanentError ? "failed_permanent" : "failed";
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
