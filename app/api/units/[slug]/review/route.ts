// Owner view of the AI listing review (advisory). Owner mode only (the unit's
// signed-in owner, or the draft's own browser); demo units are always preview.
// GET reads ai_cache only and never runs the model. POST queues the pipeline's
// review step again (e.g. after a specs edit made the cached review stale).
import { getUnit, jobsOf, unitId } from "@/lib/db/store";
import { deny, limit, spendBlocked } from "@/lib/guard";
import { editMode } from "@/lib/owner";
import { enqueue } from "@/lib/pipeline/jobs";
import { cachedReview, reviewInputOf } from "@/lib/pipeline/review";

const err = (error: string, status: number) => Response.json({ error }, { status });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const [unit, id] = await Promise.all([getUnit(slug), unitId(slug)]);
  if (!unit || !id) return err("NOT_FOUND", 404);
  if ((await editMode(slug)) !== "owner") return err("OWNER_ONLY", 403);
  const job = (await jobsOf(id)).find((j) => j.step === "review");
  // No review row yet while the unit is still processing: the step will be queued
  // after the listing step, so the panel keeps polling.
  const status = job?.status ?? (unit.status === "processing" ? "queued" : null);
  const review = unit.title_en ? await cachedReview(reviewInputOf(unit)) : null;
  if (!review) return Response.json({ pending: true, job: status }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ pending: false, job: status, review }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  // JSON only: a cross-site form post cannot set this content type.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return err("UNSUPPORTED_MEDIA_TYPE", 415);
  const slug = (await params).slug;
  const id = await unitId(slug);
  if (!id) return err("NOT_FOUND", 404);
  if ((await editMode(slug)) !== "owner") return err("OWNER_ONLY", 403);
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit("upload", req);
  if (!allowed.ok) return deny(allowed.code);
  await enqueue(id, slug, ["review"]);
  return Response.json({ ok: true }, { status: 202 });
}
