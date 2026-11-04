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
import { UPLOAD_PATH_RE } from "@/lib/upload-names";

// Fixed codes only (error.<CODE> in lib/i18n); never validation prose or exception text.
const bad = (error: string) => Response.json({ error }, { status: 400 });
const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Exactly a file /api/blob/upload (or /api/blob/local) would issue for this slug: uploads/<slug>/frame-<i>.jpg
// or uploads/<slug>/source.<mp4|mov|webm> (lib/upload-names), in our own Blob store or local media.
function uploadsFile(url: string, slug: string): string | null {
  let pathname: string;
  if (isLocalMediaUrl(url)) pathname = url.slice(1);
  else if (isBlobUrl(url)) { try { const u = new URL(url); if (u.search || u.hash) return null; pathname = u.pathname.slice(1); } catch { return null; } }
  else return null;
  const m = pathname.match(UPLOAD_PATH_RE);
  return m && m[1] === slug ? m[2] : null;
}
const isFrameUrl = (url: string, slug: string) => uploadsFile(url, slug)?.startsWith("frame-") ?? false;
const isVideoUrl = (url: string, slug: string) => uploadsFile(url, slug)?.startsWith("source.") ?? false;

export async function POST(req: Request) {
  const owner = await currentOwner();
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return bad("BAD_REQUEST"); }
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

  if (!SLUG_RE.test(slug)) return bad("BAD_REQUEST");
  const fields = { district, floor_text, available_from, kind, rent_egp, daily_egp };
  const fieldError = ownerFieldsError(fields);
  if (fieldError) return bad(fieldError);
  if (!Array.isArray(frameUrls) || frameUrls.length < CAPS.framesMin || frameUrls.length > CAPS.framesMax || !frameUrls.every((u) => typeof u === "string"))
    return bad("FRAMES_INVALID");
  if (frameTimes && (frameTimes.length !== frameUrls.length || !frameTimes.every((t) => Number.isFinite(t) && t >= 0))) return bad("FRAMES_INVALID");
  for (const u of frameUrls as string[]) if (!isFrameUrl(u, slug)) return bad("MEDIA_URL_INVALID");
  if (videoUrl !== null && !isVideoUrl(videoUrl, slug)) return bad("MEDIA_URL_INVALID");
  const location = await resolveLocation(locationText);
  if (!location) return bad("LOCATION_INVALID");

  try {
    const frames = (frameUrls as string[]).map((url, i) => ({ url, t: frameTimes?.[i] ?? i }));
    await startUploadedUnit({ slug, fields, location, ownership, frames, videoUrl });
    return Response.json({ slug }, { status: 202 });
  } catch (e) {
    // Code + slug only (slugs are random upload ids, not PII); the exception text stays server-side.
    console.error("[upload] start failed", slug, (e as Error).name);
    return Response.json({ error: "UPLOAD_FAILED" }, { status: 502 });
  }
}
