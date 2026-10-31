// Owner upload: validate, store the unit (status processing) with its keyframes
// and location, then hand off to the pipeline (lib/pipeline/jobs.ts). The
// survey, listing and renders run as separate QStash steps after this returns.
import { addMedia, createUploadedUnit, replaceKeyframes, setUnitStatus, type RentPeriod } from "@/lib/db/store";
import { isBlobUrl } from "@/lib/blob";
import { enqueue } from "@/lib/pipeline/jobs";
import { resolveLocation } from "@/lib/geo";
import type { UnitKind } from "@/lib/meta/prompts";
import { CAPS, deny, limit, spendBlocked } from "@/lib/guard";

const bad = (error: string) => Response.json({ error }, { status: 400 });
const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isUploadsUrl(url: string, slug: string): boolean {
  if (!isBlobUrl(url)) return false;
  try {
    return new URL(url).pathname.startsWith(`/uploads/${slug}/`);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return bad("expected JSON body"); }
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit("upload", req);
  if (!allowed.ok) return deny(allowed.code);

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
  if (!district) return bad("district is required");
  if (!floor_text) return bad("floor_text is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(available_from) || Number.isNaN(Date.parse(available_from))) return bad("available_from must be YYYY-MM-DD");
  if (kind !== "furnished" && kind !== "semifinished") return bad("kind must be furnished|semifinished");
  if (!Number.isInteger(rent_egp) || rent_egp <= 0) return bad("rent_egp must be a positive integer");
  if (daily_egp !== null && (!Number.isInteger(daily_egp) || daily_egp <= 0)) return bad("daily_egp must be a positive integer");
  if (!Array.isArray(frameUrls) || frameUrls.length < CAPS.framesMin || frameUrls.length > CAPS.framesMax || !frameUrls.every((u) => typeof u === "string"))
    return bad(`expected ${CAPS.framesMin}-${CAPS.framesMax} frame URLs`);
  if (frameTimes && (frameTimes.length !== frameUrls.length || !frameTimes.every((t) => Number.isFinite(t) && t >= 0))) return bad("frameTimes must match frameUrls");
  for (const u of frameUrls as string[]) if (!isUploadsUrl(u, slug)) return bad("frame URL must be a Blob URL under uploads/<slug>/");
  if (videoUrl !== null && !isUploadsUrl(videoUrl, slug)) return bad("video URL must be a Blob URL under uploads/<slug>/");
  const location = await resolveLocation(locationText);
  if (!location) return bad("LOCATION_INVALID");

  const rent_periods: RentPeriod[] = kind === "furnished" ? ["daily", "monthly"] : ["long_term"];
  let created = false;
  try {
    const unitId = await createUploadedUnit({ slug, kind: kind as UnitKind, district, rent_egp, daily_egp, floor_text, available_from, rent_periods, ...location });
    created = true;
    await replaceKeyframes(unitId, (frameUrls as string[]).map((url, i) => ({ url, meta: { t: frameTimes?.[i] ?? i, frame: i } })));
    if (videoUrl) await addMedia(unitId, "video", videoUrl, null, {});
    await enqueue(unitId, slug, ["analyze"]);
    return Response.json({ slug }, { status: 202 });
  } catch (e) {
    if (created) { try { await setUnitStatus(slug, "failed"); } catch { /* keep original error */ } }
    return Response.json({ error: `ingest: ${(e as Error).message}` }, { status: 502 });
  }
}
