// Fit-out renders for one unit (plan/06 6.6, O1). GET: the unit's staging plan
// and which styles exist. POST {style}: render one missing style. Existing
// styles return immediately and never cost a call. Renders only for the unit's
// signed-in owner (lib/owner editMode); everyone else gets a calm preview reply.
import { getUnit, stagedOf, unitRef } from "@/lib/db/store";
import { isCurrent, planStaging, stageOne } from "@/lib/pipeline/staging";
import type { Survey } from "@/lib/pipeline/survey";
import type { UseVerdict } from "@/lib/pipeline/rubric";
import { deny, limit, spendBlocked } from "@/lib/guard";
import { isDemoUnit } from "@/lib/demo-units";
import { editMode } from "@/lib/owner";

export const maxDuration = 300;

async function load(slug: string) {
  const [ref, unit] = await Promise.all([unitRef(slug), getUnit(slug)]);
  if (!ref || !unit) return null;
  const survey = unit.specs.survey as Survey | undefined; const uses = unit.specs.uses as UseVerdict[] | undefined;
  const jobs = survey && uses ? planStaging(survey, uses) : [];
  const staged = await stagedOf(ref.id);
  return { ref, jobs: jobs.map((j) => ({ ...j, done: staged.some((m) => isCurrent(m, j)) })) };
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
  // Only the owner renders; demo and other listings stay the same for everyone: no model call.
  if ((await editMode(x.ref.slug)) !== "owner") return Response.json({ ok: true, preview: true, demo: isDemoUnit(x.ref.slug) });
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
