// Publish a guest draft: list it and make it bookable. Needs this browser's guest
// cookie (matching units.guest_owner) AND a WhatsApp sign-in; the owner number then
// owns the unit. Local mock path (WhatsApp not configured and not on Vercel): the
// guest cookie alone publishes, with the 'local-demo' sentinel owner (lib/db/auth). wa_id is never returned or logged.
import { publishDraft, unitOwnerWaId } from "@/lib/db/auth";
import { isDemoUnit } from "@/lib/demo-units";
import { deny, limit } from "@/lib/guard";
import { currentGuest, currentOwner, editModeFor, publishMockAllowed } from "@/lib/owner";

const err = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  // JSON only: a cross-site form post cannot set this content type.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return err("UNSUPPORTED_MEDIA_TYPE", 415);
  const allowed = await limit("spec_edit", req);
  if (!allowed.ok) return deny(allowed.code);
  const slug = (await params).slug;
  if (isDemoUnit(slug)) return err("NOT_DRAFT", 409);
  const unit = await unitOwnerWaId(slug);
  if (!unit) return err("NOT_FOUND", 404);
  if (!unit.guest_owner || unit.owner_wa_id) return err("NOT_DRAFT", 409);
  const guestId = await currentGuest();
  // Only the browser that uploaded the draft may publish it.
  if (!guestId || editModeFor(slug, { owner_wa_id: null, guest_owner: unit.guest_owner }, { guestId }) !== "owner") return err("NOT_DRAFT_OWNER", 403);
  const owner = await currentOwner();
  const mock = !owner && publishMockAllowed();
  if (!owner && !mock) return err("SIGN_IN_REQUIRED", 401);
  const status = await publishDraft(slug, guestId, owner?.waId ?? null);
  if (!status) return err("NOT_DRAFT", 409);
  // ready = listed now; otherwise it is listed once the pipeline finishes.
  return Response.json({ ok: true, slug, mock, ready: status === "ready" });
}
