// Fit-out renders for one unit (plan/06 6.6, O1). GET: the unit's staging plan
// and which styles exist. POST {style}: render one missing style. Existing
// styles return immediately and never cost a call. Owner-only once Clerk lands (6.8).
import { getUnit, stagedOf, unitRef } from "@/lib/db/store";
import { planStaging, stageOne } from "@/lib/pipeline/staging";
import type { Survey } from "@/lib/pipeline/survey";
import type { UseVerdict } from "@/lib/pipeline/rubric";
import { deny, limit, spendBlocked } from "@/lib/guard";
import { STAGE_VERSION } from "@/lib/meta/prompts";

export const maxDuration = 300;

async function load(slug: string) {
  const [ref, unit] = await Promise.all([unitRef(slug), getUnit(slug)]);
  if (!ref || !unit) return null;
  const survey = unit.specs.survey as Survey | undefined; const uses = unit.specs.uses as UseVerdict[] | undefined;
  const jobs = survey && uses ? planStaging(survey, uses) : [];
  const done = new Set((await stagedOf(ref.id)).filter((m) => m.meta.prompt === STAGE_VERSION).map((m) => m.style));
  return { ref, jobs: jobs.map((j) => ({ ...j, done: done.has(j.style) })) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const x = await load((await params).slug);
  return x ? Response.json({ jobs: x.jobs }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const x = await load((await params).slug);
  if (!x) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const { style } = (await req.json().catch(() => ({}))) as { style?: string };
  const job = x.jobs.find((j) => j.style === style);
  if (!job) return Response.json({ error: "STYLE_NOT_IN_PLAN" }, { status: 400 });
  if (job.done) return Response.json({ ok: true, cached: true });
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit("image_edit", req);
  if (!allowed.ok) return deny(allowed.code);
  try {
    const url = await stageOne(x.ref, job);
    return Response.json({ ok: true, url });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
