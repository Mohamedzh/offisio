import { getUnit, mergeUnitSpecs } from "@/lib/db/store";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid JSON body" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "bad body" }, { status: 400 });
  const { slug, specs } = body as { slug?: unknown; specs?: unknown };
  if (typeof slug !== "string" || !slug) return Response.json({ error: "slug is required" }, { status: 400 });
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return Response.json({ error: "specs must be an object" }, { status: 400 });
  const unit = await getUnit(slug);
  if (!unit) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const merged = await mergeUnitSpecs(slug, specs as Record<string, unknown>);
  if (!merged) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json({ ok: true });
}
