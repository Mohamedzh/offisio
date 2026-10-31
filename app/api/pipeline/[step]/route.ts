// QStash delivery for one pipeline step (plan/06 6.7 step 2). Signed by QStash;
// non-2xx makes QStash retry, so only retryable failures return 500.
import { ROUTES, runStep, routeOf, type StepMsg } from "@/lib/pipeline/jobs";
import { routeUrl, verifySignature } from "@/lib/qstash";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ step: string }> }) {
  const route = (await params).step;
  if (!(ROUTES as readonly string[]).includes(route)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const raw = await req.text();
  if (!verifySignature(req.headers.get("upstash-signature"), raw, routeUrl(`/api/pipeline/${route}`)))
    return Response.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  let msg: StepMsg;
  try { msg = JSON.parse(raw) as StepMsg; } catch { return Response.json({ error: "bad body" }, { status: 400 }); }
  if (typeof msg.slug !== "string" || typeof msg.step !== "string" || routeOf(msg.step) !== route)
    return Response.json({ error: "bad body" }, { status: 400 });
  const result = await runStep(msg.slug, msg.step);
  return Response.json({ result }, { status: result === "failed" ? 500 : 200 });
}
