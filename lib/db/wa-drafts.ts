// WhatsApp listing drafts (plan/08 8.1, table wa_listing_drafts): one row per owner
// video while the bot collects the missing details. wa_id is PII: stored here only,
// never logged. guest_id is the random guest_owner the unit is created with.
import { pool } from "./pg";

export type DraftStatus = "collecting" | "processing" | "ready" | "published" | "expired";
export interface DraftFields {
  rent_egp?: number | null; daily_egp?: number | null; floor_text?: string | null; kind?: "furnished" | "semifinished" | null;
  available_from?: string | null; district?: string | null; lat?: number | null; lng?: number | null;
  frame_times?: number[]; // internal: keyframe times in seconds, same order as frame_urls
}
export interface WaDraft {
  id: string; wa_id: string; slug: string; guest_id: string; video_url: string | null; frame_urls: string[];
  fields: DraftFields; status: DraftStatus; lang: "ar" | "en" | null; created_at: Date;
}
const COLS = "id, wa_id, slug, guest_id, video_url, frame_urls, fields, status, lang, created_at";

// The sender's latest draft that still takes chat: collecting details (24 h), processing
// (24 h; answers "link"/"status" only) or ready to publish (7 days).
export async function activeDraft(waId: string): Promise<WaDraft | null> {
  const { rows } = await pool().query<WaDraft>(
    `select ${COLS} from wa_listing_drafts where wa_id = $1
       and ((status in ('collecting','processing') and updated_at > now() - interval '24 hours')
         or (status = 'ready' and updated_at > now() - interval '7 days'))
     order by updated_at desc limit 1`, [waId]);
  return rows[0] ?? null;
}
export async function draftBySlug(slug: string): Promise<WaDraft | null> {
  const { rows } = await pool().query<WaDraft>(`select ${COLS} from wa_listing_drafts where slug = $1`, [slug]);
  return rows[0] ?? null;
}
// A new video replaces this sender's unfinished draft; anyone's stale collecting rows expire.
// Returns the expired slugs (collecting drafts have no unit yet, so their media can be deleted).
export async function expireStaleDrafts(waId: string): Promise<string[]> {
  const { rows } = await pool().query<{ slug: string }>(
    `update wa_listing_drafts set status = 'expired', updated_at = now()
     where status = 'collecting' and (updated_at < now() - interval '24 hours' or wa_id = $1) returning slug`, [waId]);
  return rows.map((r) => r.slug);
}
// Created as soon as the video passes the limits (video_url null until storage finishes),
// so a pin or details sent meanwhile land in this draft.
export async function createDraft(d: { waId: string; slug: string; guestId: string; lang: "ar" | "en" | null }): Promise<WaDraft> {
  const { rows } = await pool().query<WaDraft>(
    `insert into wa_listing_drafts (wa_id, slug, guest_id, lang) values ($1,$2,$3,$4) returning ${COLS}`,
    [d.waId, d.slug, d.guestId, d.lang]);
  return rows[0];
}
// Video stored: set the media on a still-collecting draft; returns the row with any fields merged meanwhile.
export async function setDraftMedia(id: string, videoUrl: string, frameUrls: string[], frameTimes: number[]): Promise<WaDraft | null> {
  const { rows } = await pool().query<WaDraft>(
    `update wa_listing_drafts set video_url = $2, frame_urls = $3, fields = fields || jsonb_build_object('frame_times', $4::jsonb), updated_at = now()
     where id = $1 and status = 'collecting' returning ${COLS}`, [id, videoUrl, frameUrls, JSON.stringify(frameTimes)]);
  return rows[0] ?? null;
}
// Pipeline status of the draft's unit ('processing' | 'ready' | 'failed'), null before it exists.
// failedForS: seconds since its latest failed analyze/listing step (the steps that fail a unit;
// 0 when none failed), so a unit
// still inside QStash retries is not treated as dead.
export async function draftUnitStatus(slug: string): Promise<{ status: string; failedForS: number } | null> {
  const { rows } = await pool().query<{ status: string; failed_for_s: number }>(
    `select u.status, coalesce(extract(epoch from now() - (select max(j.updated_at) from pipeline_jobs j where j.unit_id = u.id and j.status = 'failed' and j.step in ('analyze','listing'))), 0)::float as failed_for_s
     from units u where u.slug = $1`, [slug]);
  return rows[0] ? { status: rows[0].status, failedForS: rows[0].failed_for_s } : null;
}
// Shallow merge into fields (null/undefined values in `patch` are ignored); lang kept when null.
export async function mergeDraftFields(id: string, patch: DraftFields, lang: "ar" | "en" | null): Promise<WaDraft | null> {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined));
  const { rows } = await pool().query<WaDraft>(
    `update wa_listing_drafts set fields = fields || $2::jsonb, lang = coalesce($3, lang), updated_at = now()
     where id = $1 and status = 'collecting' returning ${COLS}`, [id, JSON.stringify(clean), lang]);
  return rows[0] ?? null;
}
// Compare-and-set: true only when the row was in one of `from` (so each transition happens once).
export async function setDraftStatus(id: string, to: DraftStatus, from: DraftStatus[]): Promise<boolean> {
  const { rowCount } = await pool().query(
    "update wa_listing_drafts set status = $2, updated_at = now() where id = $1 and status = any($3::text[])", [id, to, from]);
  return rowCount === 1;
}
