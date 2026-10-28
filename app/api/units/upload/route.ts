import { addMedia, createUploadedUnit, generateAvailability, saveGenerated, setUnitStatus, type RentPeriod } from "@/lib/db/store";
import { isBlobUrl } from "@/lib/blob";
import { generateListing, generateSpecs, type UploadOwner } from "@/lib/pipeline/specs-listing";
import type { UnitKind } from "@/lib/meta/prompts";

export const maxDuration = 300;

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

  const slug = String(body.slug ?? "");
  const district = String(body.district ?? "").trim();
  const floor_text = String(body.floor_text ?? "").trim();
  const available_from = String(body.available_from ?? "").trim();
  const kind = String(body.kind ?? "");
  const rent_egp = Number(body.rent_egp);
  const dailyRaw = body.daily_egp;
  const daily_egp = dailyRaw === null || dailyRaw === undefined || dailyRaw === "" ? null : Number(dailyRaw);
  const heroIndex = Number(body.heroIndex ?? 0);
  const frameUrls = body.frameUrls;
  const videoUrl = body.videoUrl === undefined || body.videoUrl === null ? null : String(body.videoUrl);

  if (!SLUG_RE.test(slug)) return bad("slug is invalid");
  if (!district) return bad("district is required");
  if (!floor_text) return bad("floor_text is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(available_from) || Number.isNaN(Date.parse(available_from))) return bad("available_from must be YYYY-MM-DD");
  if (kind !== "furnished" && kind !== "semifinished") return bad("kind must be furnished|semifinished");
  if (!Number.isInteger(rent_egp) || rent_egp <= 0) return bad("rent_egp must be a positive integer");
  if (daily_egp !== null && (!Number.isInteger(daily_egp) || daily_egp <= 0)) return bad("daily_egp must be a positive integer");
  if (!Array.isArray(frameUrls) || frameUrls.length < 3 || frameUrls.length > 10 || !frameUrls.every((u) => typeof u === "string"))
    return bad("expected 3-10 frame URLs");
  for (const u of frameUrls as string[]) if (!isUploadsUrl(u, slug)) return bad("frame URL must be a Blob URL under uploads/<slug>/");
  if (videoUrl !== null && !isUploadsUrl(videoUrl, slug)) return bad("video URL must be a Blob URL under uploads/<slug>/");
  if (!Number.isInteger(heroIndex) || heroIndex < 0 || heroIndex >= frameUrls.length) return bad("heroIndex out of range");

  const owner: UploadOwner = { district, rent_egp, daily_egp, floor_text, available_from, kind: kind as UnitKind };
  const rent_periods: RentPeriod[] = kind === "furnished" ? ["daily", "monthly"] : ["long_term"];
  let step = "ingest";
  let created = false;
  try {
    const unitId = await createUploadedUnit({ slug, kind: kind as UnitKind, district, rent_egp, daily_egp, floor_text, available_from, rent_periods });
    created = true;
    const urls = frameUrls as string[];
    // Hero first so it is identifiable; all frames stored as keyframes.
    const order = [heroIndex, ...urls.map((_, i) => i).filter((i) => i !== heroIndex)];
    for (const i of order) await addMedia(unitId, "keyframe", urls[i], null, i === heroIndex ? { hero: true } : {});
    if (videoUrl) await addMedia(unitId, "video", videoUrl, null, {});
    // Fetch frames server-side for the specs model (keeps AI input identical).
    const dataUrls = await Promise.all(urls.map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`fetch frame failed: ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      return `data:image/jpeg;base64,${buf.toString("base64")}`;
    }));
    step = "specs";
    const specs = await generateSpecs(dataUrls, owner);
    step = "listing";
    const listing = await generateListing(specs, owner);
    step = "save";
    await saveGenerated(unitId, specs, listing);
    await generateAvailability(unitId, available_from);
    await setUnitStatus(slug, "ready");
    return Response.json({ slug }, { status: 201 });
  } catch (e) {
    if (created) { try { await setUnitStatus(slug, "failed"); } catch { /* keep original error */ } }
    return Response.json({ error: `${step}: ${(e as Error).message}` }, { status: 502 });
  }
}
