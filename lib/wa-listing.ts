// List an office by sending a video on WhatsApp (plan/08 8.1). The owner sends a
// walkthrough video; the bot stores it with server-side keyframes, collects the missing
// details by chat (text, voice note or location pin), creates the unit as a guest draft
// through the same path as the web upload, sends a single-use link when the pipeline is
// done, and publishes on "publish" / "انشر". Owner messages, captions, transcripts,
// coordinates and wa_id are PII: model calls go to meta.product only and nothing but
// the message id and a fixed code is ever logged.
//
// Video turn time budget (webhook maxDuration 120 s, all in after()): Graph media lookup 8 s
// + bytes 20 s + ffmpeg probe 5 s + frames 25 s + storage deadline 15 s + caption extraction
// 20 s (one try, no validation retry; short Maps links are not expanded in a caption) + one
// reply sendText 10 s = 103 s, plus a few DB queries and the unit create + enqueue (QStash
// publish, typically < 2 s): about 15 s of reserve. Measured locally: ffmpeg ~1 s.
// A turn killed anyway leaves a draft without video: after 3 min it is treated as dead.
import { randomBytes } from "node:crypto";
import { deleteUploads, putPublic } from "./blob";
import { egpLabel } from "./booking-labels";
import { publishDraft, unitOwnerWaId } from "./db/auth";
import { todayCairo } from "./db/store";
import { activeDraft, createDraft, draftBySlug, draftUnitStatus, expireStaleDrafts, mergeDraftFields, setDraftMedia, setDraftStatus, type DraftFields, type WaDraft } from "./db/wa-drafts";
import { ownerLocation, resolveLocationDetailed, SHORT_HOSTS } from "./geo";
import { CAPS, limitKey, spendBlocked } from "./guard";
import { toTranscribableWav } from "./audio";
import { MetaError, meta } from "./meta/client";
import { OWNER_DETAILS_PROMPT_V1 } from "./meta/prompts";
import { chatJson } from "./pipeline/specs-listing";
import { hasContactInfo } from "./pipeline/review";
import { ownerFieldsError, startUploadedUnit } from "./upload-unit";
import { extractFrames, VIDEO_MIMES, VideoError } from "./video-frames";
import { listingLinkUrl } from "./wa-link";
import { downloadMedia, mediaInfo, senderKey, sendText, sessionKeyFor, VIDEO_MEDIA, type IncomingMessage, type MediaInfo } from "./whatsapp";

type Lang = "ar" | "en";
const isArabic = (s: string) => /[؀-ۿ]/.test(s);
// Language of an owner text; null without letters (a "lat, lng" or a bare link keeps the draft's language).
const langOf = (s: string | null | undefined): Lang | null => {
  const words = (s ?? "").replace(/https?:\/\/\S+/gi, " ");
  return isArabic(words) ? "ar" : /\p{L}{2,}/u.test(words) ? "en" : null;
};
const UPLOAD_DEADLINE_MS = 15_000;
const DEAD_VIDEO_MS = 3 * 60_000; // a collecting draft still without video this long after creation

// Fixed bilingual texts. Unknown language (a video without caption, a pin) -> AR then EN.
const T = {
  gotVideo: { ar: "وصلني الفيديو ✅ ابعتلي موقع المكتب 📍 وقولي الإيجار الشهري، الدور، اسم المنطقة، وسعر اليوم لو فيه. كتابة أو فويس نوت، زي ما تحب. (ابعت «إلغاء» لو عايز توقف)", en: "Got your video ✅ Send the office location pin 📍 and tell me the monthly rent, the floor, the district, and the daily price if any. Text or a voice note is fine. (Send \"cancel\" to stop.)" },
  videoStored: { ar: "وصلني الفيديو ✅", en: "Got your video ✅" },
  stillProcessing: { ar: "لسه بجهز الفيديو بتاعك ⏳", en: "Still processing your video ⏳" },
  understood: { ar: "فهمت:", en: "Got it:" },
  stillNeed: { ar: "لسه محتاج:", en: "Still need:" },
  stopHint: { ar: "(ابعت «إلغاء» لو عايز توقف)", en: "(Send \"cancel\" to stop.)" },
  analyzing: { ar: "تمام، كده عندي كل حاجة 👌 بجهز إعلانك دلوقتي: بحلل المكتب من الفيديو، بكتب الإعلان بالعربي والإنجليزي، وبعمل صور للمكتب بعد التجهيز. ده بياخد حوالي ٣ لـ ٥ دقايق، وهبعتلك الرابط أول ما يخلص.", en: "All set 👌 Making your listing now: analyzing the space from your video, writing the Arabic and English listing, and creating the staged photos. This takes about 3 to 5 minutes; I'll send the link as soon as it's done." },
  stillAnalyzing: { ar: "لسه شغال على إعلانك والصور، شوية كمان وهبعتلك الرابط.", en: "Still working on your listing and photos. I'll send the link as soon as it's done." },
  ready: { ar: "إعلانك والصور جاهزين 👈 {link}\nافتح الرابط عشان تراجعه وتعدّله (بيشتغل مرة واحدة خلال ٣٠ دقيقة)، أو رد بـ «انشر» وهننشره على رقمك. عايز رابط جديد؟ ابعت «رابط».", en: "Your listing and photos are ready 👉 {link}\nOpen it to review and edit (works once, for 30 minutes), or reply \"publish\" to list it under your number. Need a new link? Send \"link\"." },
  readyNoLink: { ar: "إعلانك جاهز ✅ رد بـ «انشر» وهننشره على رقمك.", en: "Your listing is ready ✅ Reply \"publish\" to list it under your number." },
  published: { ar: "✅ اتنشر على رقمك", en: "✅ Listed under your number" },
  publishFailed: { ar: "مقدرتش أنشر الإعلان ده. ابعت «رابط» وجرب من الصفحة.", en: "I couldn't publish this listing. Send \"link\" and try from the page." },
  cancelled: { ar: "تمام، لغيت الإعلان ده. ابعت فيديو جديد في أي وقت.", en: "OK, I dropped this listing. Send a new video any time." },
  pipelineFailed: { ar: "معلش، مقدرناش نحلل الفيديو ده. ابعت فيديو تاني بيلف على المكتب (لحد ٤٥ ثانية).", en: "Sorry, we couldn't analyze that video. Please send another walkthrough (up to 45 seconds)." },
  createFailed: { ar: "معلش، حصلت مشكلة وإحنا بنجهز الإعلان. ابعت الفيديو تاني.", en: "Sorry, something went wrong preparing the listing. Please send the video again." },
  videoTooLong: { ar: "الفيديو أطول من ٤٥ ثانية. ابعت فيديو أقصر بيلف على المكتب.", en: "That video is over 45 seconds. Please send a shorter walkthrough." },
  videoTooBig: { ar: "الفيديو كبير أوي (أكتر من ١٦ ميجا). ابعته تاني من غير HD، أو صوّر فيديو أقصر (٢٠ لـ ٤٥ ثانية كفاية).", en: "That video is too large (over 16 MB). Send it again without HD, or a shorter clip (20 to 45 seconds is plenty)." },
  videoTooBigDoc: { ar: "الملف ده أكبر من ١٦ ميجا. ابعته كفيديو من الجاليري (مش كملف)، وواتساب هيصغّره لوحده.", en: "That file is over 16 MB. Send it as a video from your gallery (not as a document) and WhatsApp will compress it." },
  videoLost: { ar: "معلش، الفيديو مكملش معايا. ابعته تاني لو سمحت.", en: "Sorry, that video didn't finish processing. Please send it again." },
  shortLink: { ar: "اللينك المختصر مش بيفتح هنا: ابعت موقع المكتب 📍 أو اللينك الكامل من جوجل ماب.", en: "Short links don't open here: send the office location pin 📍 or the full Google Maps link." },
  videoBad: { ar: "مقدرتش أقرا الفيديو ده. ابعته تاني كفيديو (مش كملف).", en: "I couldn't read that video. Please send it again as a video (not a document)." },
  videoLimited: { ar: "وصلت للحد اليومي للفيديوهات. جرب تاني بكرة أو ارفع من الموقع.", en: "You've reached today's video limit. Try again tomorrow or upload on the website." },
  limited: { ar: "وصلنا للحد اليومي. جرب تاني بكرة.", en: "We've reached today's limit. Please try again tomorrow." },
  linkNoLocation: { ar: "مقدرتش أطلع موقع من اللينك ده. ابعت موقع المكتب 📍 (من 📎 ← الموقع) أو اكتب الإحداثيات.", en: "I couldn't read a location from that link. Send the office location pin 📍 (📎 → Location) or the coordinates instead." },
  locationBad: { ar: "مقدرتش أستخدم الموقع ده (لازم يكون في مصر). ابعت موقع المكتب 📍 أو لينك جوجل ماب.", en: "I couldn't use that location (it must be in Egypt). Send the office location pin 📍 or a Google Maps link." },
  noContact: { ar: "من غير أرقام تليفون أو لينكات في اسم المنطقة أو الدور لو سمحت.", en: "Please leave phone numbers and links out of the district and floor." },
  tooLong: { ar: "الرسالة طويلة شوية، ممكن تختصرها؟", en: "That message is a bit long. Could you shorten it?" },
  voiceFailed: { ar: "معلش، مقدرتش أسمع الفويس كويس. ممكن تبعته تاني أو تكتبه؟", en: "Sorry, I couldn't make out that voice note. Could you resend it or type it?" },
  notUnderstood: { ar: "مفهمتش التفاصيل. اكتبلي مثلاً: الزمالك، الدور التاني، ١٥ ألف في الشهر، ٨٠٠ في اليوم. (ابعت «إلغاء» لو عايز توقف)", en: "I couldn't find the details. For example: Zamalek, 2nd floor, 15,000 a month, 800 a day. (Send \"cancel\" to stop.)" },
} as const;
type Key = keyof typeof T;
const say = (key: Key, lang: Lang | null, vars: Record<string, string> = {}) => {
  const fill = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), s);
  return lang ? fill(T[key][lang]) : `${fill(T[key].ar)}\n${fill(T[key].en)}`;
};
const NEED: Record<"location" | "rent" | "floor" | "district", Record<Lang, string>> = {
  location: { ar: "موقع المكتب 📍", en: "the location pin 📍" },
  rent: { ar: "الإيجار الشهري", en: "the monthly rent" },
  floor: { ar: "الدور", en: "the floor" },
  district: { ar: "اسم المنطقة", en: "the district" },
};

// Owner keywords (trimmed, trailing punctuation ignored).
const norm = (t: string) => t.trim().replace(/[\s.!?,؟،]+$/u, "").toLowerCase();
export const isPublish = (t: string) => ["publish", "انشر", "انشره", "نشر", "أنشر"].includes(norm(t));
export const isCancel = (t: string) => ["cancel", "الغاء", "إلغاء", "الغي", "ألغي", "إلغي"].includes(norm(t));
export const isLinkRequest = (t: string) => ["link", "رابط", "الرابط", "لينك", "اللينك"].includes(norm(t));
export const isStatusRequest = (t: string) => ["status", "حالة", "الحالة"].includes(norm(t));

// --- details extraction -------------------------------------------------------
export interface OwnerDetails { rent_egp: number | null; daily_egp: number | null; floor_text: string | null; kind: "furnished" | "semifinished" | null; available_from: string | null; district: string | null; contact_rejected: boolean }
const DETAIL_KEYS = ["rent_egp", "daily_egp", "floor_text", "kind", "available_from", "district"] as const;
const int = (v: unknown, k: string, min: number, max: number): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`${k} must be an integer or null`);
  return v >= min && v <= max ? v : null; // out of range: treated as not stated
};
const str = (v: unknown, k: string, max: number): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new Error(`${k} must be a string or null`);
  const s = v.trim().replace(/\s+/g, " ");
  return s && s.length <= max ? s : null;
};
// Model JSON -> validated details. Wrong types throw (one feedback retry in chatJson);
// contact details in floor/district drop that field and set contact_rejected.
export function validateOwnerDetails(raw: unknown, today: string): OwnerDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("reply is not an object");
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!(DETAIL_KEYS as readonly string[]).includes(k)) throw new Error(`unexpected key ${k}`);
  let contact_rejected = false;
  const clean = (s: string | null) => { if (s && hasContactInfo(s)) { contact_rejected = true; return null; } return s; };
  const kind = r.kind ?? null;
  if (kind !== null && kind !== "furnished" && kind !== "semifinished") throw new Error("kind must be furnished|semifinished|null");
  const date = str(r.available_from, "available_from", 10);
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : null;
  return {
    rent_egp: int(r.rent_egp, "rent_egp", 100, 10_000_000),
    daily_egp: int(r.daily_egp, "daily_egp", 10, 1_000_000),
    floor_text: clean(str(r.floor_text, "floor_text", 40)),
    kind: kind as OwnerDetails["kind"],
    available_from: validDate && validDate >= today ? validDate : null, // a past date: default (today) applies
    district: clean(str(r.district, "district", 60)),
    contact_rejected,
  };
}
// One model try with a 20 s timeout (meta.product.chatOnce); attempts 1 skips the validation
// feedback retry (video caption turns, which already spent most of their time budget).
export async function extractDetails(text: string, today: string, attempts = 2): Promise<OwnerDetails> {
  return chatJson<OwnerDetails>([
    { role: "system", content: OWNER_DETAILS_PROMPT_V1 },
    { role: "user", content: `TODAY: ${today}\nMESSAGE: ${text}` },
  ], (raw) => validateOwnerDetails(raw, today), meta.product.chatOnce, attempts);
}

// Required before the unit is created. kind defaults to furnished and available_from to
// today (Cairo); daily_egp is optional.
export function missingFields(f: DraftFields): (keyof typeof NEED)[] {
  const out: (keyof typeof NEED)[] = [];
  if (typeof f.lat !== "number" || typeof f.lng !== "number") out.push("location");
  if (!f.rent_egp) out.push("rent");
  if (!f.floor_text) out.push("floor");
  if (!f.district) out.push("district");
  return out;
}
function summaryLine(f: DraftFields, lang: Lang): string {
  const parts: string[] = [];
  if (f.district) parts.push(f.district);
  if (f.floor_text) parts.push(lang === "ar" ? `الدور: ${f.floor_text}` : `floor: ${f.floor_text}`);
  if (f.rent_egp) parts.push(`${egpLabel(f.rent_egp, lang)}${lang === "ar" ? " في الشهر" : "/month"}`);
  if (f.daily_egp) parts.push(`${egpLabel(f.daily_egp, lang)}${lang === "ar" ? " في اليوم" : "/day"}`);
  if (f.kind) parts.push(lang === "ar" ? (f.kind === "furnished" ? "مفروش" : "نص تشطيب") : f.kind);
  if (f.available_from) parts.push(lang === "ar" ? `متاح من ${f.available_from}` : `from ${f.available_from}`);
  if (typeof f.lat === "number") parts.push(f.place_label ? `📍 ${f.place_label} ✓` : "📍 ✓");
  return parts.join(" · ");
}
function progressText(f: DraftFields, lang: Lang | null): string {
  const one = (l: Lang) => {
    const missing = missingFields(f);
    const s = summaryLine(f, l);
    return [s ? `${T.understood[l]} ${s}` : "", missing.length ? `${T.stillNeed[l]} ${missing.map((k) => NEED[k][l]).join(l === "ar" ? "، " : ", ")}\n${T.stopHint[l]}` : ""].filter(Boolean).join("\n");
  };
  return lang ? one(lang) : `${one("ar")}\n\n${one("en")}`;
}

// --- sending (fixed codes only in logs) ---------------------------------------
const codeOf = (e: unknown): string => {
  if (e instanceof MetaError) return `META_${e.status}`;
  if (e instanceof VideoError) return e.code;
  const err = e as Error | null;
  return /^[A-Z][A-Z0-9_]{2,}\b/.exec(err?.message ?? "")?.[0] ?? err?.name ?? "ERROR";
};

// A collecting draft has no unit yet, so nothing else uses its uploads/<slug>/ files: delete
// them on expiry. Best effort, never fails the turn. Uploads still in flight when the draft
// expires (withDeadline does not abort them) can land afterwards and stay orphaned.
async function dropDraftMedia(slug: string): Promise<void> {
  try { await deleteUploads(slug); } catch (e) { console.error("[wa-listing] media delete failed", slug, codeOf(e)); }
}
async function expireCollecting(draft: WaDraft): Promise<boolean> {
  const ok = await setDraftStatus(draft.id, "expired", ["collecting"]);
  if (ok) await dropDraftMedia(draft.slug);
  return ok;
}
async function reply(m: { id: string; from: string }, body: string, opts?: { preview?: boolean }): Promise<void> {
  try { await sendText(m.from, body, opts); } catch (e) { console.error("[wa-listing] send failed", m.id, codeOf(e)); }
}
const sessionOf = (from: string) => senderKey(sessionKeyFor(from, todayCairo()));
// Same per-sender chat cap as a renter turn; checked before each paid model call.
const chatAllowed = async (from: string) => (await limitKey("chat", sessionOf(from))).ok;
// Listing "link" / "status" requests: own per-sender bucket (not the booking-link codes').
const linkAllowed = async (from: string) => (await limitKey("wa_listing_link", sessionOf(from))).ok;
function withDeadline<T>(p: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

// --- entry point from the webhook ---------------------------------------------
// True when the message belonged to the owner listing flow (and was answered).
export async function routeOwnerListing(m: IncomingMessage): Promise<boolean> {
  if (m.type === "video") { await handleOwnerVideo(m); return true; }
  const draft = await activeDraft(m.from);
  return draft ? handleDraftMessage(m, draft) : false;
}

export async function handleOwnerVideo(m: IncomingMessage): Promise<void> {
  const caption = m.video?.caption ?? null;
  const lang = langOf(caption);
  if (!m.video) return reply(m, say("videoBad", lang));
  const tooBig = m.video.asDocument ? "videoTooBigDoc" : "videoTooBig";
  // Limits before any download, ffmpeg or storage. Type and size (free Graph lookup) are checked
  // first so a wrong or oversized file does not use one of the sender's daily videos.
  if (await spendBlocked()) return reply(m, say("limited", lang));
  if (!(VIDEO_MIMES as readonly string[]).includes(m.video.mimeType)) return reply(m, say("videoBad", lang));
  let info: MediaInfo;
  try { info = await mediaInfo(m.video.id, VIDEO_MEDIA.maxBytes); } catch (e) {
    const code = codeOf(e);
    console.error("[wa-listing] video lookup failed", m.id, code);
    return reply(m, say(code === "WHATSAPP_MEDIA_TOO_LARGE" ? tooBig : "videoBad", lang));
  }
  if (!(await limitKey("wa_video", sessionOf(m.from))).ok) return reply(m, say("videoLimited", lang));
  // The draft exists before the slow part, so a pin or details sent meanwhile land in it.
  for (const old of await expireStaleDrafts(m.from)) await dropDraftMedia(old);
  const slug = randomBytes(12).toString("base64url");
  const draft = await createDraft({ waId: m.from, slug, guestId: randomBytes(18).toString("base64url"), lang });
  let stored: WaDraft | null;
  try {
    const media = await downloadMedia(m.video.id, { ...VIDEO_MEDIA, info });
    const mime = (VIDEO_MIMES as readonly string[]).includes(media.mimeType) ? media.mimeType : m.video.mimeType;
    const { frames } = await extractFrames(media.bytes, mime);
    // Same storage names as the browser upload (lib/upload-names.ts).
    const [videoUrl, ...frameUrls] = await withDeadline(Promise.all([
      putPublic(`uploads/${slug}/source.mp4`, Buffer.from(media.bytes), mime),
      ...frames.map((f, i) => putPublic(`uploads/${slug}/frame-${i}.jpg`, f.jpg, "image/jpeg")),
    ]), UPLOAD_DEADLINE_MS, "UPLOAD_TIMEOUT");
    stored = await setDraftMedia(draft.id, videoUrl, frameUrls, frames.map((f) => f.t));
  } catch (e) {
    const code = codeOf(e);
    console.error("[wa-listing] video failed", m.id, code);
    await expireCollecting(draft); // also deletes any files already uploaded
    return reply(m, say(code === "VIDEO_TOO_LONG" ? "videoTooLong" : code === "WHATSAPP_MEDIA_TOO_LARGE" ? tooBig : "videoBad", lang));
  }
  if (!stored) return; // cancelled while the video was processing
  // Details in the caption: same turn (counts toward the chat cap; one try, no retry, no short-link hops).
  if (caption) return applyText(m, stored, caption, lang, "", false, 1, false);
  const l = stored.lang ?? lang;
  if (!missingFields(stored.fields).length) return startDraftUnit(m, stored, l, `${say("videoStored", l)}\n`);
  const known = summaryLine(stored.fields, l ?? "en");
  return reply(m, known ? `${say("videoStored", l)}\n${progressText(stored.fields, l)}` : say("gotVideo", lang));
}

// Text / voice / pin while a draft is collecting; "link"/"status" while processing;
// publish / link while it is ready. False = not part of this flow (the renter agent handles it).
export async function handleDraftMessage(m: IncomingMessage, draft: WaDraft): Promise<boolean> {
  const text = m.text?.trim() ?? "";
  if (draft.status === "processing") {
    if (!text || !(isLinkRequest(text) || isStatusRequest(text))) return false;
    await processingStatus(m, draft, langOf(text) ?? draft.lang);
    return true;
  }
  if (draft.status === "ready") {
    if (!text) return false;
    const lang = langOf(text);
    if (isPublish(text)) { await publishFromChat(m, draft, lang); return true; }
    if (isLinkRequest(text)) {
      if (!(await linkAllowed(m.from))) await reply(m, say("limited", lang ?? draft.lang));
      else await sendReadyLink(m, draft, lang ?? draft.lang);
      return true;
    }
    return false;
  }
  if (draft.status !== "collecting") return false;
  // The video turn never stored the video (killed or crashed): drop the draft, ask again.
  if (!draft.video_url && Date.now() - new Date(draft.created_at).getTime() > DEAD_VIDEO_MS) {
    if (await expireCollecting(draft)) await reply(m, say("videoLost", null));
    return true;
  }
  if (m.type === "location") {
    const loc = m.location ? ownerLocation(m.location) : null;
    if (!loc) { await reply(m, say("locationBad", draft.lang)); return true; }
    await applyPatch(m, draft, { lat: loc.lat, lng: loc.lng, place_label: "" }, draft.lang);
    return true;
  }
  if (m.audio) { await applyVoice(m, draft, m.audio); return true; }
  if (!text) { await reply(m, say("gotVideo", draft.lang)); return true; }
  const lang = langOf(text);
  if (isCancel(text)) { await expireCollecting(draft); await reply(m, say("cancelled", lang)); return true; }
  await applyText(m, draft, text, lang, "", false);
  return true;
}

// "link" / "status" while the pipeline runs: answer from the unit's status. A unit failed for
// at least 10 min (past QStash's retries) expires the draft (send the video again); a ready
// one gets its link now; anything else is still analyzing.
const FAILED_FOR_GOOD_S = 10 * 60;
const RENDERS_STUCK_S = 10 * 60;
async function processingStatus(m: IncomingMessage, draft: WaDraft, lang: Lang | null): Promise<void> {
  if (!(await linkAllowed(m.from))) return reply(m, say("limited", lang));
  const unit = await draftUnitStatus(draft.slug);
  const status = unit?.status ?? null;
  if (status === "failed" && unit!.failedForS >= FAILED_FOR_GOOD_S) {
    if (await setDraftStatus(draft.id, "expired", ["processing"])) return reply(m, say("pipelineFailed", lang));
    return;
  }
  // Same moment as the pipeline's own message (renders finished), or 10 min after the listing
  // went live if a render is stuck: the owner is never left without a link.
  const linkDue = status === "ready" && (unit!.settled || unit!.listingDoneForS >= RENDERS_STUCK_S);
  if (linkDue && (await setDraftStatus(draft.id, "ready", ["processing"]))) return sendReadyLink(m, draft, lang);
  return reply(m, say("stillAnalyzing", lang));
}

async function applyVoice(m: IncomingMessage, draft: WaDraft, audio: NonNullable<IncomingMessage["audio"]>): Promise<void> {
  if (!audio.voice) return reply(m, say("gotVideo", draft.lang));
  if ((await spendBlocked()) || !(await chatAllowed(m.from))) return reply(m, say("limited", draft.lang));
  let text = "";
  try {
    const media = await downloadMedia(audio.id);
    text = (await meta.product.transcribe(await toTranscribableWav(media.bytes, media.mimeType || audio.mimeType))).text.trim();
  } catch (e) { console.error("[wa-listing] voice failed", m.id, codeOf(e)); }
  if (!text) return reply(m, say("voiceFailed", draft.lang));
  const lang = langOf(text);
  if (isCancel(text)) { await expireCollecting(draft); return reply(m, say("cancelled", lang)); }
  // The voice extraction shares the chat cap already counted above.
  return applyText(m, draft, text, lang, `🎙️ "${text}"\n\n`, true);
}

const URL_RE = /https?:\/\/\S+/i;
const COORD_PAIR_RE = /^\s*-?\d{1,3}(?:\.\d+)?\s*[, ]\s*-?\d{1,3}(?:\.\d+)?\s*$/;
// Location from a Maps link or "lat, lng"; the rest goes to one structured extraction.
// expand false: short Maps links are not followed (caption turn); the owner is asked for a pin or the full link.
async function applyText(m: IncomingMessage, draft: WaDraft, text: string, lang: Lang | null, prefix: string, limitCounted: boolean, attempts = 2, expand = true): Promise<void> {
  lang ??= draft.lang;
  if (text.length > CAPS.chatChars) return reply(m, prefix + say("tooLong", lang));
  const patch: DraftFields = {};
  // Trailing punctuation is not part of a pasted link ("…/@30.1,31.2,17z).").
  const url = text.match(URL_RE)?.[0].replace(/[)،.,]+$/u, "");
  const found = await resolveLocationDetailed(url ?? text, { expand });
  const loc = found?.loc ?? null;
  if (found) { patch.lat = found.loc.lat; patch.lng = found.loc.lng; patch.place_label = found.label?.slice(0, 80) ?? ""; } // "" clears an older label (merge skips nulls)
  let shortSkipped = false;
  if (url && !loc && !expand) { try { shortSkipped = SHORT_HOSTS.has(new URL(url).hostname); } catch { /* not a URL */ } }
  if (shortSkipped) prefix += say("shortLink", lang) + "\n\n";
  // Only a message that is nothing but a coordinate pair skips the extraction.
  const rest = (url ? text.replace(url, " ") : COORD_PAIR_RE.test(text) ? "" : text).trim();
  let contactRejected = false;
  if (/[\p{L}\p{N}]{2,}/u.test(rest)) {
    if (!limitCounted && ((await spendBlocked()) || !(await chatAllowed(m.from)))) return reply(m, prefix + say("limited", lang));
    try {
      const d = await extractDetails(rest, todayCairo(), attempts);
      contactRejected = d.contact_rejected;
      for (const k of DETAIL_KEYS) if (d[k] !== null) (patch as Record<string, unknown>)[k] = d[k];
    } catch (e) { console.error("[wa-listing] details failed", m.id, codeOf(e)); }
  }
  if (!Object.keys(patch).length) {
    // Nothing new here, but a pin / details sent while the video was processing may already be complete.
    const fresh = await draftBySlug(draft.slug);
    if (fresh?.status === "collecting" && fresh.video_url && !missingFields(fresh.fields).length) return startDraftUnit(m, fresh, lang ?? fresh.lang, prefix);
    if (shortSkipped) return reply(m, prefix.trimEnd());
    return reply(m, prefix + say(contactRejected ? "noContact" : loc === null && url ? "linkNoLocation" : "notUnderstood", lang));
  }
  return applyPatch(m, draft, patch, lang, prefix + (contactRejected ? `${say("noContact", lang)}\n\n` : ""));
}

async function applyPatch(m: IncomingMessage, draft: WaDraft, patch: DraftFields, lang: Lang | null, prefix = ""): Promise<void> {
  const next = await mergeDraftFields(draft.id, patch, lang);
  if (!next) return; // no longer collecting (cancelled or already started)
  const l = lang ?? next.lang;
  // Video still downloading / extracting: keep the details; the video turn starts the unit.
  if (!next.video_url) return reply(m, `${prefix}${say("stillProcessing", l)}\n${progressText(next.fields, l)}`);
  if (missingFields(next.fields).length) return reply(m, prefix + progressText(next.fields, l));
  return startDraftUnit(m, next, l, prefix);
}

// All details known: create the unit as a guest draft owned by the draft's random guest id,
// exactly like the web upload, and start the pipeline.
async function startDraftUnit(m: IncomingMessage, draft: WaDraft, lang: Lang | null, prefix: string): Promise<void> {
  const f = draft.fields;
  const fields = {
    district: f.district ?? "", floor_text: f.floor_text ?? "", rent_egp: f.rent_egp ?? 0, daily_egp: f.daily_egp ?? null,
    // The survey runs after the unit is created, so it cannot supply kind here: furnished
    // unless the owner said otherwise (editable on the draft page before publishing).
    kind: f.kind ?? "furnished",
    available_from: f.available_from ?? todayCairo(),
  };
  if (ownerFieldsError(fields) || typeof f.lat !== "number" || typeof f.lng !== "number" || !draft.video_url) return reply(m, prefix + progressText(f, lang));
  if (!(await setDraftStatus(draft.id, "processing", ["collecting"]))) return; // another message got here first
  try {
    const times = f.frame_times ?? [];
    await startUploadedUnit({
      slug: draft.slug, fields, location: { lat: f.lat, lng: f.lng }, ownership: { owner_wa_id: null, guest_owner: draft.guest_id },
      frames: draft.frame_urls.map((url, i) => ({ url, t: times[i] ?? i })), videoUrl: draft.video_url,
    });
  } catch (e) {
    console.error("[wa-listing] create failed", m.id, codeOf(e));
    await setDraftStatus(draft.id, "expired", ["processing"]);
    return reply(m, prefix + say("createFailed", lang));
  }
  return reply(m, `${prefix}${lang ? `${T.understood[lang]} ${summaryLine({ ...f, ...fields }, lang)}\n` : ""}${say("analyzing", lang)}`);
}

async function sendReadyLink(m: { id: string; from: string }, draft: WaDraft, lang: Lang | null): Promise<void> {
  const link = listingLinkUrl({ slug: draft.slug, gid: draft.guest_id, lang: lang ?? "en" });
  // No link preview: a crawler fetching the link would use up its single use.
  await reply(m, link ? say("ready", lang, { link }) : say("readyNoLink", lang), { preview: false });
}

async function publishFromChat(m: IncomingMessage, draft: WaDraft, lang: Lang | null): Promise<void> {
  let ok = (await publishDraft(draft.slug, draft.guest_id, draft.wa_id)) !== null;
  // Already published from the page with the link: same owner, same answer.
  if (!ok) ok = (await unitOwnerWaId(draft.slug))?.owner_wa_id === draft.wa_id;
  if (!ok) return reply(m, say("publishFailed", lang));
  await setDraftStatus(draft.id, "published", ["ready"]);
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const one = (l: Lang) => `${T.published[l]}${app ? `: ${app}/${l}/units/${draft.slug}` : ""}`;
  return reply(m, lang ? one(lang) : `${one("ar")}\n${one("en")}`);
}

// Pipeline hook (lib/pipeline/jobs.ts): "ready" after the review step (done or failed),
// "failed" when analyze/listing failed for good. Acts once per draft (compare-and-set on
// status); never throws into the pipeline.
export async function notifyDraftPipeline(slug: string, outcome: "ready" | "failed"): Promise<void> {
  try {
    const draft = await draftBySlug(slug);
    if (!draft || draft.status !== "processing") return;
    const m = { id: `pipeline:${slug}`, from: draft.wa_id };
    if (outcome === "failed") {
      if (await setDraftStatus(draft.id, "expired", ["processing"])) await reply(m, say("pipelineFailed", draft.lang));
      return;
    }
    if (await setDraftStatus(draft.id, "ready", ["processing"])) await sendReadyLink(m, draft, draft.lang);
  } catch (e) {
    console.error("[wa-listing] notify failed", slug, codeOf(e));
  }
}
