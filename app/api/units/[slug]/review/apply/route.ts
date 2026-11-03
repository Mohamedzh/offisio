// Apply the AI review's corrected text to chosen listing fields. Owner mode only
// (demo units are always preview), JSON only, spec_edit limit. The text comes from
// the cached review (never from the request) and is re-validated before writing.
import { getUnit, unitId } from "@/lib/db/store";
import { deny, limit } from "@/lib/guard";
import { editMode } from "@/lib/owner";
import { applyReviewFixes, REVIEW_FIELDS, type ReviewField } from "@/lib/pipeline/review";

const err = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  // JSON only: a cross-site form post cannot set this content type.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return err("UNSUPPORTED_MEDIA_TYPE", 415);
  const slug = (await params).slug;
  const [unit, id] = await Promise.all([getUnit(slug), unitId(slug)]);
  if (!unit || !id) return err("NOT_FOUND", 404);
  if ((await editMode(slug)) !== "owner") return err("OWNER_ONLY", 403);
  const allowed = await limit("spec_edit", req);
  if (!allowed.ok) return deny(allowed.code);
  const body = (await req.json().catch(() => null)) as { fields?: unknown } | null;
  const fields = body?.fields;
  if (!Array.isArray(fields) || !fields.length || fields.length > REVIEW_FIELDS.length || !fields.every((f) => (REVIEW_FIELDS as readonly unknown[]).includes(f)))
    return err("REVIEW_NO_FIELDS", 400);
  const r = await applyReviewFixes(unit, id, [...new Set(fields as ReviewField[])]);
  if (!r.ok) return err(r.code, r.code === "REVIEW_NOT_READY" ? 409 : 422);
  return Response.json({ ok: true, review: r.review });
}
