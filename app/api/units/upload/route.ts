import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addMedia, createUploadedUnit, generateAvailability, saveGenerated, setUnitStatus, type RentPeriod } from "@/lib/db/store";
import { generateListing, generateSpecs, type UploadOwner } from "@/lib/pipeline/specs-listing";
import type { UnitKind } from "@/lib/meta/prompts";

export const maxDuration = 300;

const bad = (error: string) => Response.json({ error }, { status: 400 });

export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return bad("expected multipart form data"); }

  const district = String(form.get("district") ?? "").trim();
  const floor_text = String(form.get("floor_text") ?? "").trim();
  const available_from = String(form.get("available_from") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const rentRaw = String(form.get("rent_egp") ?? "");
  const dailyRaw = String(form.get("daily_egp") ?? "").trim();
  const rent_egp = Number(rentRaw);
  const daily_egp = dailyRaw === "" ? null : Number(dailyRaw);
  const heroIndex = Number(form.get("heroIndex") ?? 0);

  if (!district) return bad("district is required");
  if (!floor_text) return bad("floor_text is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(available_from) || Number.isNaN(Date.parse(available_from))) return bad("available_from must be YYYY-MM-DD");
  if (kind !== "furnished" && kind !== "semifinished") return bad("kind must be furnished|semifinished");
  if (!Number.isInteger(rent_egp) || rent_egp <= 0) return bad("rent_egp must be a positive integer");
  if (daily_egp !== null && (!Number.isInteger(daily_egp) || daily_egp <= 0)) return bad("daily_egp must be a positive integer");

  const frames: File[] = [];
  for (let i = 0; ; i++) {
    const f = form.get(`frame${i}`);
    if (f === null) break;
    if (!(f instanceof File)) return bad(`frame${i} must be a file`);
    frames.push(f);
  }
  if (frames.length < 3 || frames.length > 10) return bad("expected 3-10 keyframe frames");
  for (const [i, f] of frames.entries()) {
    if (f.type && f.type !== "image/jpeg") return bad(`frame${i} must be image/jpeg`);
    if (f.size === 0) return bad(`frame${i} is empty`);
  }
  if (!Number.isInteger(heroIndex) || heroIndex < 0 || heroIndex >= frames.length) return bad("heroIndex out of range");

  const owner: UploadOwner = { district, rent_egp, daily_egp, floor_text, available_from, kind: kind as UnitKind };
  const rent_periods: RentPeriod[] = kind === "furnished" ? ["daily", "monthly"] : ["long_term"];
  const slug = randomBytes(12).toString("base64url");
  let step = "ingest";
  let created = false;
  try {
    const unitId = await createUploadedUnit({ slug, kind: kind as UnitKind, district, rent_egp, daily_egp, floor_text, available_from, rent_periods });
    created = true;
    const dir = join(process.cwd(), "public", "uploads", slug);
    await mkdir(dir, { recursive: true });
    const buffers = await Promise.all(frames.map(async (f) => Buffer.from(await f.arrayBuffer())));
    for (let i = 0; i < buffers.length; i++) await writeFile(join(dir, `frame-${i}.jpg`), buffers[i]);
    // Hero first so it is identifiable; all frames stored as keyframes.
    const order = [heroIndex, ...frames.map((_, i) => i).filter((i) => i !== heroIndex)];
    for (const i of order) await addMedia(unitId, "keyframe", `/uploads/${slug}/frame-${i}.jpg`, null, i === heroIndex ? { hero: true } : {});
    const dataUrls = buffers.map((b) => `data:image/jpeg;base64,${b.toString("base64")}`);
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
