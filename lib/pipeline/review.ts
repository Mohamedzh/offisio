// Listing review: an AI proofread of the generated listing text that the owner
// sees before publishing. Advisory only: it never changes unit status or
// visibility, and a failed review leaves the listing usable.
// Listing copy is product data with no PII: meta.nonPii (muse-spark-1.3; the
// dev switch only in local runs). Output is validated strictly; one
// validation-feedback retry, then REVIEW_INVALID. Cached in ai_cache by a hash
// of the reviewed inputs, so the same text never costs twice.
import { nonPiiModel } from "../meta/client";
import { LISTING_REVIEW_PROMPT_V2 } from "../meta/prompts";
import { pool } from "../db/pg";
import type { Unit } from "../db/store";
import { cacheKey } from "./cache";
import { chatJson, JsonValidationError } from "./specs-listing";

export const REVIEW_FIELDS = ["title_ar", "title_en", "description_ar", "description_en"] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];
export const ISSUE_KINDS = ["typo", "grammar", "language_mix", "unsupported_claim", "contradiction", "contact_info", "tone"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export interface ReviewIssue { field: ReviewField; kind: IssueKind; note_en: string; note_ar: string; fix: string }
export interface ListingReview { ok: boolean; issues: ReviewIssue[]; corrected: Record<ReviewField, string> }

export interface ReviewInput {
  listing: Record<ReviewField, string>;
  specs: Record<string, unknown>;
  owner: { district: string; floor: string; kind: Unit["kind"]; rent_egp: number; daily_egp: number | null };
}

export const MAX_ISSUES = 8;
const NOTE_MAX = 300;
const FIX_MAX = 400;
// Text caps for applied text (titles and descriptions).
export const TEXT_MAX: Record<ReviewField, number> = { title_ar: 160, title_en: 160, description_ar: 1500, description_en: 1500 };
// Listing text field -> units column.
export const COLUMN: Record<ReviewField, string> = { title_ar: "title_ar", title_en: "title_en", description_ar: "summary_ar", description_en: "summary_en" };

export const PROMPT_VERSION = "LISTING_REVIEW_PROMPT_V2";
export class ReviewInvalidError extends Error { constructor() { super("REVIEW_INVALID"); } }

// Contact details in listing text: emails, URLs/domains, social handles and phone
// numbers (Arabic-Indic digits included). A phone is a digit run of 10+ digits that
// starts with "+", a 0 trunk prefix (01x/02) or country code 20 + non-zero digit, or
// an Egyptian mobile anywhere; dates, prices and price ranges do not match.
const toAsciiDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
export function hasContactInfo(text: string): boolean {
  const s = toAsciiDigits(text);
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s)) return true;
  if (/(https?:\/\/|www\.)\S+/i.test(s) || /\b[\w-]+\.(com|net|org|eg|io|me|co|info|biz)\b/i.test(s)) return true;
  if (/(^|\s)@[A-Za-z0-9_.]{3,}/.test(s)) return true;
  if (/(?:^|\D)01[0125](?:[\s-]?\d){8}(?!\d)/.test(s)) return true;
  for (const m of s.match(/\+?\d[\d\s\-().]{6,}\d/g) ?? []) {
    const d = m.replace(/\D/g, "");
    if (d.length >= 10 && (m.startsWith("+") || /^0[1-9]/.test(d) || /^20[1-9]/.test(d))) return true;
  }
  return false;
}

// What the reviewer sees: the current listing text, a compact specs summary
// (no raw survey) with the passing uses, and the owner fields. Deterministic,
// so the read route finds the same cache key.
export function reviewInputOf(unit: Unit): ReviewInput {
  const { survey: _s, uses, owner_edited: _o, listing_owner_edited: _l, ...rest } = unit.specs as Record<string, unknown>; void _s; void _o; void _l;
  const passing = Array.isArray(uses) ? (uses as { use?: unknown; verdict?: unknown }[]).filter((u) => u.verdict !== "not_suitable").map((u) => ({ use: u.use, verdict: u.verdict })) : [];
  return {
    listing: { title_ar: unit.title_ar, title_en: unit.title_en, description_ar: unit.summary_ar, description_en: unit.summary_en },
    specs: { ...rest, uses: passing },
    owner: { district: unit.district, floor: unit.floor_text, kind: unit.kind, rent_egp: unit.rent_egp, daily_egp: unit.daily_egp },
  };
}

export const reviewKey = (input: ReviewInput, model = nonPiiModel()): string =>
  cacheKey("review", model, PROMPT_VERSION, [LISTING_REVIEW_PROMPT_V2, JSON.stringify(input)]);

const str = (v: unknown, max: number, allowEmpty = false): v is string =>
  typeof v === "string" && v.length <= max && (allowEmpty || v.trim().length > 0);

// Strict shape/enum/length check, then normalization: issues capped at 8, ok
// derived from issues, and a field without an issue keeps its original text (so
// applying a fix never touches anything the reviewer did not flag).
export function validateReview(raw: unknown, original: Record<ReviewField, string>): ListingReview {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("review is not an object");
  const r = raw as Record<string, unknown>;
  if (typeof r.ok !== "boolean") throw new Error("review.ok invalid");
  if (!Array.isArray(r.issues)) throw new Error("review.issues invalid");
  const issues: ReviewIssue[] = r.issues.slice(0, MAX_ISSUES).map((x, i) => {
    if (!x || typeof x !== "object") throw new Error(`review.issues[${i}] invalid`);
    const it = x as Record<string, unknown>;
    if (!(REVIEW_FIELDS as readonly unknown[]).includes(it.field)) throw new Error(`review.issues[${i}].field invalid`);
    if (!(ISSUE_KINDS as readonly unknown[]).includes(it.kind)) throw new Error(`review.issues[${i}].kind invalid`);
    if (!str(it.note_en, NOTE_MAX) || !str(it.note_ar, NOTE_MAX)) throw new Error(`review.issues[${i}].note invalid`);
    if (!str(it.fix, FIX_MAX, true)) throw new Error(`review.issues[${i}].fix invalid`);
    return { field: it.field as ReviewField, kind: it.kind as IssueKind, note_en: it.note_en.trim(), note_ar: it.note_ar.trim(), fix: it.fix.trim() };
  });
  const c = r.corrected as Record<string, unknown> | null;
  if (!c || typeof c !== "object") throw new Error("review.corrected invalid");
  const flagged = new Set(issues.map((i) => i.field));
  const corrected = {} as Record<ReviewField, string>;
  for (const f of REVIEW_FIELDS) {
    if (typeof c[f] !== "string") throw new Error(`review.corrected.${f} invalid`);
    if (!flagged.has(f)) { corrected[f] = original[f]; continue; }
    // Same cap as apply (TEXT_MAX), so a validated fix is always applicable.
    if (!str(c[f], TEXT_MAX[f])) throw new Error(`review.corrected.${f} invalid or longer than ${TEXT_MAX[f]}`);
    const v = (c[f] as string).trim();
    if (v === original[f].trim()) throw new Error(`review.corrected.${f} is unchanged but has issues`);
    if (hasContactInfo(v)) throw new Error(`review.corrected.${f} still has contact details`);
    corrected[f] = v;
  }
  return { ok: issues.length === 0, issues, corrected };
}

// One model call plus at most one validation-feedback retry (chatJson), then REVIEW_INVALID.
export async function callReview(input: ReviewInput): Promise<ListingReview> {
  try {
    return await chatJson<ListingReview>([
      { role: "system", content: LISTING_REVIEW_PROMPT_V2 },
      { role: "user", content: `LISTING: ${JSON.stringify(input.listing)}\nSPECS: ${JSON.stringify(input.specs)}\nOWNER: ${JSON.stringify(input.owner)}` },
    ], (raw) => validateReview(raw, input.listing));
  } catch (e) {
    if (!(e instanceof JsonValidationError)) throw e;
    console.warn(`[review] invalid output twice: ${e.message.slice(0, 200)}`);
    throw new ReviewInvalidError();
  }
}

export async function cachedReview(input: ReviewInput): Promise<ListingReview | null> {
  const { rows } = await pool().query<{ result: ListingReview }>("select result from ai_cache where key = $1", [reviewKey(input)]);
  return rows[0]?.result ?? null;
}

async function storeReview(input: ReviewInput, review: ListingReview): Promise<void> {
  await pool().query(
    "insert into ai_cache (key, kind, model, prompt_version, result) values ($1, 'review', $2, $3, $4) on conflict (key) do nothing",
    [reviewKey(input), nonPiiModel(), PROMPT_VERSION, JSON.stringify(review)]);
}

// Pipeline step body: cache hit costs nothing; otherwise one call (+1 retry).
export async function reviewListing(input: ReviewInput): Promise<ListingReview> {
  const hit = await cachedReview(input);
  if (hit) { console.log("[cache] hit review"); return hit; }
  const review = await callReview(input);
  await storeReview(input, review);
  return review;
}

export type ApplyResult = { ok: true; review: ListingReview } | { ok: false; code: "REVIEW_NOT_READY" | "REVIEW_FIX_INVALID" };

// Owner applies the reviewer's corrected text for some fields. Re-validated
// (length caps, no contact details) before writing; the listing is marked
// owner-applied in specs (same place as the specs edit flow's owner_edited).
// The remaining issues are cached under the new text's key (no model call),
// so the review for the new text is known without paying again.
export async function applyReviewFixes(unit: Unit, unitId: string, fields: ReviewField[]): Promise<ApplyResult> {
  const input = reviewInputOf(unit);
  const review = await cachedReview(input);
  if (!review) return { ok: false, code: "REVIEW_NOT_READY" };
  const flagged = new Set(review.issues.map((i) => i.field));
  const chosen = fields.filter((f) => flagged.has(f));
  if (!chosen.length) return { ok: true, review };
  for (const f of chosen) {
    const v = review.corrected[f];
    if (typeof v !== "string" || !v.trim() || v.length > TEXT_MAX[f] || hasContactInfo(v)) return { ok: false, code: "REVIEW_FIX_INVALID" };
  }
  // Guarded by the reviewed text: if the listing changed since (a concurrent apply
  // or a listing re-run), nothing is written and the caller reloads.
  const n = chosen.length;
  const sets = chosen.map((f, i) => `${COLUMN[f]} = $${i + 2}`).join(", ");
  const guards = chosen.map((f, i) => `${COLUMN[f]} is not distinct from $${i + 2 + n}`).join(" and ");
  const { rowCount } = await pool().query(`update units set ${sets} where id = $1 and ${guards}`,
    [unitId, ...chosen.map((f) => review.corrected[f]), ...chosen.map((f) => input.listing[f])]);
  if (!rowCount) return { ok: false, code: "REVIEW_NOT_READY" };
  // Marker: the owner accepted AI fixes (for future regeneration guards).
  await pool().query(`update specs set data = data || '{"listing_owner_edited":true}'::jsonb where unit_id = $1`, [unitId]);
  const nextListing = { ...input.listing };
  for (const f of chosen) nextListing[f] = review.corrected[f];
  const issues = review.issues.filter((i) => !chosen.includes(i.field));
  const next: ListingReview = { ok: issues.length === 0, issues, corrected: { ...review.corrected, ...Object.fromEntries(chosen.map((f) => [f, nextListing[f]])) } };
  await storeReview({ ...input, listing: nextListing }, next);
  return { ok: true, review: next };
}
