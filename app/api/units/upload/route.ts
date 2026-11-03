// Owner upload: validate, store the unit (status processing) with its keyframes
// and location, then hand off to the pipeline (lib/pipeline/jobs.ts). The
// survey, listing and renders run as separate QStash steps after this returns.
// Signed-in owners own the unit; anyone else uploads as a guest and the unit is
// a private draft (units.guest_owner) until published with WhatsApp sign-in.
import { isBlobUrl, isLocalMediaUrl } from "@/lib/blob";
import { resolveLocation } from "@/lib/geo";
import { CAPS, deny, limit, spendBlocked } from "@/lib/guard";
import { currentOwner, issueGuest } from "@/lib/owner";
import { ownerFieldsError, startUploadedUnit } from "@/lib/upload-unit";

const bad = (error: string) => Response.json({ error }, { status: 400 });
const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isUploadsUrl(url: string, slug: string): boolean {
  // Local media fallback (no Blob token, never on Vercel): /uploads/<slug>/<file>.
  if (isLocalMediaUrl(url)) return url.startsWith(`/uploads/${slug}/`) && !url.slice(`/uploads/${slug}/`.length).includes("/");
  if (!isBlobUrl(url)) return false;
  try {
    return new URL(url).pathname.startsWith(`/uploads/${slug}/`);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const owner = await currentOwner();
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return bad("expected JSON body"); }
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit("upload", req);
  if (!allowed.ok) return deny(allowed.code);
  // Same limits for guests; the cookie usually exists already (issued with the Blob token).
  const ownership = owner ? { owner_wa_id: owner.waId } : { owner_wa_id: null, guest_owner: await issueGuest() };

  const slug = String(body.slug ?? "");
  const district = String(body.district ?? "").trim();
  const floor_text = String(body.floor_text ?? "").trim();
  const available_from = String(body.available_from ?? "").trim();
  const kind = String(body.kind ?? "");
  const rent_egp = Number(body.rent_egp);
  const dailyRaw = body.daily_egp;
  const daily_egp = dailyRaw === null || dailyRaw === undefined || dailyRaw === "" ? null : Number(dailyRaw);
  const frameUrls = body.frameUrls;
  const frameTimes = Array.isArray(body.frameTimes) ? (body.frameTimes as unknown[]).map(Number) : null;
  const videoUrl = body.videoUrl === undefined || body.videoUrl === null ? null : String(body.videoUrl);
  const locationText = String(body.location ?? "");

  if (!SLUG_RE.test(slug)) return bad("slug is invalid");
  const fields = { district, floor_text, available_from, kind, rent_egp, daily_egp };
  const fieldError = ownerFieldsError(fields);
  if (fieldError) return bad(fieldError);
  if (!Array.isArray(frameUrls) || frameUrls.length < CAPS.framesMin || frameUrls.length > CAPS.framesMax || !frameUrls.every((u) => typeof u === "string"))
    return bad(`expected ${CAPS.framesMin}-${CAPS.framesMax} frame URLs`);
  if (frameTimes && (frameTimes.length !== frameUrls.length || !frameTimes.every((t) => Number.isFinite(t) && t >= 0))) return bad("frameTimes must match frameUrls");
  for (const u of frameUrls as string[]) if (!isUploadsUrl(u, slug) || !u.endsWith(".jpg")) return bad("frame URL must be a .jpg Blob URL under uploads/<slug>/");
  if (videoUrl !== null && !isUploadsUrl(videoUrl, slug)) return bad("video URL must be a Blob URL under uploads/<slug>/");
  const location = await resolveLocation(locationText);
  if (!location) return bad("LOCATION_INVALID");

  try {
    const frames = (frameUrls as string[]).map((url, i) => ({ url, t: frameTimes?.[i] ?? i }));
    await startUploadedUnit({ slug, fields, location, ownership, frames, videoUrl });
    return Response.json({ slug }, { status: 202 });
  } catch (e) {
    return Response.json({ error: `ingest: ${(e as Error).message}` }, { status: 502 });
  }
}
