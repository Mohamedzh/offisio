// Owner view of the post-upload pipeline (plan/06 6.7 step 2).
// GET: per-step status. POST {step}: retry one failed (or stuck) step alone.
// Owner-only once Clerk lands (6.9).
import { jobsOf, unitRef } from "@/lib/db/store";
import { enqueue, routeOf } from "@/lib/pipeline/jobs";
import { deny, limit, spendBlocked } from "@/lib/guard";

const STUCK_MS = 6 * 60_000;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ref = await unitRef((await params).slug);
  if (!ref) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json({ jobs: await jobsOf(ref.id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ref = await unitRef((await params).slug);
  if (!ref) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const { step } = (await req.json().catch(() => ({}))) as { step?: string };
  const job = (await jobsOf(ref.id)).find((j) => j.step === step);
  if (!job || !routeOf(job.step)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const stuck = job.status === "running" && Date.now() - Date.parse(job.updated_at) > STUCK_MS;
  if (job.status !== "failed" && !stuck) return Response.json({ error: "NOT_RETRYABLE" }, { status: 409 });
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit(job.step.startsWith("stage:") ? "image_edit" : "upload", req);
  if (!allowed.ok) return deny(allowed.code);
  await enqueue(ref.id, ref.slug, [job.step]);
  return Response.json({ ok: true }, { status: 202 });
}
