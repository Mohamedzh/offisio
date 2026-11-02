// Owner spec edits. Only the SpecsEditForm fields, validated (lib/specs-edit).
// Only the unit's signed-in owner writes (lib/owner editMode). Everyone else,
// and always on demo units (lib/demo-units), gets the edit kept in one
// per-visitor preview cookie instead (latest unit only). DELETE clears it.
import { cookies } from "next/headers";
import { mergeUnitSpecs, unitRef } from "@/lib/db/store";
import { encodePreview } from "@/lib/demo-units";
import { editMode } from "@/lib/owner";
import { PREVIEW_COOKIE, PREVIEW_MAX_AGE, validateSpecsEdit } from "@/lib/specs-edit";
import { deny, limit } from "@/lib/guard";

const bad = (error: string, status = 400) => Response.json({ error }, { status });

async function readBody(req: Request): Promise<{ slug?: unknown; specs?: unknown } | Response> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return bad("UNSUPPORTED_MEDIA_TYPE", 415);
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" ? (body as { slug?: unknown; specs?: unknown }) : bad("invalid JSON body");
  } catch {
    return bad("invalid JSON body");
  }
}

export async function POST(req: Request) {
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const { slug, specs } = body;
  if (typeof slug !== "string" || !slug) return bad("slug is required");
  if (!(await unitRef(slug))) return bad("NOT_FOUND", 404);
  const preview = (await editMode(slug)) === "preview";
  // Previews write nothing, so they only count against the caller's own cap.
  const allowed = await limit("spec_edit", req, { global: !preview });
  if (!allowed.ok) return deny(allowed.code);
  const valid = validateSpecsEdit(specs);
  if (!valid.ok) return bad(valid.error);
  if (preview) {
    const value = encodePreview({ slug, specs: valid.specs });
    if (!value) return bad("PREVIEW_TOO_LARGE");
    (await cookies()).set(PREVIEW_COOKIE, value, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: PREVIEW_MAX_AGE,
    });
    return Response.json({ ok: true, preview: true });
  }
  if (!(await mergeUnitSpecs(slug, valid.specs))) return bad("NOT_FOUND", 404);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await readBody(req);
  if (body instanceof Response) return body;
  (await cookies()).delete(PREVIEW_COOKIE);
  return Response.json({ ok: true });
}
