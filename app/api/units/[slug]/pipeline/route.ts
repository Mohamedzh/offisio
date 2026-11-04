// Owner view of the post-upload pipeline (plan/06 6.7 step 2).
// GET: per-step status. POST {step}: retry one failed (or stuck) step alone.
// Retries only for the unit's signed-in owner (lib/owner editMode).
import { jobsOf, unitRef } from "@/lib/db/store";
import { enqueue, routeOf } from "@/lib/pipeline/jobs";
import { deny, limit, safeErrorCode, spendBlocked } from "@/lib/guard";
import { isDemoUnit } from "@/lib/demo-units";
import { editMode } from "@/lib/owner";

const STUCK_MS = 6 * 60_000;

// Step statuses for anyone with the link (the unit page shows the same draft by slug);
// last_error only for the unit's owner, and only as a fixed code (never provider text).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ref = await unitRef((await params).slug);
  if (!ref) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const [jobs, mode] = await Promise.all([jobsOf(ref.id), editMode(ref.slug)]);
  return Response.json({ jobs: jobs.map((j) => ({ ...j, last_error: mode === "owner" && j.last_error ? safeErrorCode(j.last_error) : null })) },
    { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ref = await unitRef((await params).slug);
  if (!ref) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const { step } = (await req.json().catch(() => ({}))) as { step?: string };
  const job = (await jobsOf(ref.id)).find((j) => j.step === step);
  if (!job || !routeOf(job.step)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  // Stuck = running too long, or queued too long (delivery lost).
  const stuck = (job.status === "running" || job.status === "queued") && Date.now() - Date.parse(job.updated_at) > STUCK_MS;
  if (job.status !== "failed" && !stuck) return Response.json({ error: "NOT_RETRYABLE" }, { status: 409 });
  // Only the owner retries; demo and other listings stay as they are: no re-run, no model call.
  if ((await editMode(ref.slug)) !== "owner") return Response.json({ ok: true, preview: true, demo: isDemoUnit(ref.slug) });
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit(job.step.startsWith("stage:") ? "image_edit" : "upload", req);
  if (!allowed.ok) return deny(allowed.code);
  await enqueue(ref.id, ref.slug, [job.step]);
  return Response.json({ ok: true }, { status: 202 });
}
