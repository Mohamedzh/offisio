// Shared create path for an owner upload (web: app/api/units/upload, WhatsApp video:
// lib/wa-listing.ts): validate the owner fields, store the unit (status processing)
// with its keyframes, video and location, then hand off to the pipeline.
import { addMedia, createUploadedUnit, replaceKeyframes, setUnitStatus, type RentPeriod } from "./db/store";
import { enqueue } from "./pipeline/jobs";
import { hasContactInfo } from "./pipeline/review";
import type { LatLng } from "./geo";
import type { UnitKind } from "./meta/prompts";

export interface OwnerUploadFields {
  district: string; floor_text: string; available_from: string; kind: string;
  rent_egp: number; daily_egp: number | null;
}

// First failing rule as the upload route's error text, or null when all fields are valid.
export function ownerFieldsError(f: OwnerUploadFields): string | null {
  if (!f.district) return "district is required";
  if (!f.floor_text) return "floor_text is required";
  // Owner fields are shown to renters and fed to the listing: no contact details.
  if (hasContactInfo(f.district) || hasContactInfo(f.floor_text)) return "CONTACT_INFO_NOT_ALLOWED";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.available_from) || Number.isNaN(Date.parse(f.available_from))) return "available_from must be YYYY-MM-DD";
  if (f.kind !== "furnished" && f.kind !== "semifinished") return "kind must be furnished|semifinished";
  if (!Number.isInteger(f.rent_egp) || f.rent_egp <= 0) return "rent_egp must be a positive integer";
  if (f.daily_egp !== null && (!Number.isInteger(f.daily_egp) || f.daily_egp <= 0)) return "daily_egp must be a positive integer";
  return null;
}

export interface StartUploadInput {
  slug: string; fields: OwnerUploadFields; location: LatLng;
  ownership: { owner_wa_id: string | null; guest_owner?: string };
  frames: { url: string; t: number }[]; videoUrl: string | null;
}
// Fields must already pass ownerFieldsError. On a failure after the unit row exists, the
// unit is marked failed and the original error is rethrown.
export async function startUploadedUnit(input: StartUploadInput): Promise<void> {
  const { slug, fields: f } = input;
  const rent_periods: RentPeriod[] = f.kind === "furnished" ? ["daily", "monthly"] : ["long_term"];
  let created = false;
  try {
    const unitId = await createUploadedUnit({
      slug, kind: f.kind as UnitKind, district: f.district, rent_egp: f.rent_egp, daily_egp: f.daily_egp, floor_text: f.floor_text,
      available_from: f.available_from, rent_periods, ...input.location, ...input.ownership,
    });
    created = true;
    await replaceKeyframes(unitId, input.frames.map((fr, i) => ({ url: fr.url, meta: { t: fr.t, frame: i } })));
    if (input.videoUrl) await addMedia(unitId, "video", input.videoUrl, null, {});
    await enqueue(unitId, slug, ["analyze", "places"]);
  } catch (e) {
    if (created) { try { await setUnitStatus(slug, "failed"); } catch { /* keep original error */ } }
    throw e;
  }
}
