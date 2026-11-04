// Renter-facing booking labels for chat and WhatsApp replies (6.8, owner 2026-11-02).
// Pure functions, no DB: friendly unit title, a weekday date label without an ISO
// digit run (WhatsApp auto-links those), a status label and an uppercased ref.
import type { Booking, BookingStatus } from "./db/store";

export type Lang = "ar" | "en";
export interface UnitTitles { title_ar: string; title_en: string; district: string }

const TZ = "Africa/Cairo";
// Western digits in Arabic too ("u-nu-latn"), matching the web UI and AI-written copy.
const LOCALE: Record<Lang, string> = { ar: "ar-EG-u-nu-latn", en: "en-GB" };

// "2026-11-01" -> EN "Sun 1 Nov", AR "الأحد 1 نوفمبر". The year is added only when it is not the current Cairo year.
export function dateLabel(day: string, lang: Lang, now = new Date()): string {
  const at = new Date(`${day}T12:00:00Z`); // midday UTC is the same calendar day in Cairo
  if (Number.isNaN(at.getTime())) return day;
  const year = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(d);
  const opts: Intl.DateTimeFormatOptions = { timeZone: TZ, weekday: lang === "ar" ? "long" : "short", day: "numeric", month: lang === "ar" ? "long" : "short" };
  if (year(at) !== year(now)) opts.year = "numeric";
  return new Intl.DateTimeFormat(LOCALE[lang], opts).formatToParts(at)
    .map((p) => (p.type === "literal" ? " " : p.value)).join("").replace(/\s+/g, " ").trim();
}

const TRACK: Record<Lang, Record<string, string>> = {
  en: { monthly: "Monthly", long_term: "Long-term" },
  ar: { monthly: "شهري", long_term: "إيجار طويل" },
};
// Daily bookings show the day; monthly/long-term show the track (plus the start day if stored).
export function whenLabel(b: Pick<Booking, "track" | "date">, lang: Lang, now = new Date()): string {
  const day = b.date ? dateLabel(b.date, lang, now) : "";
  if (b.track === "daily") return day;
  const track = TRACK[lang][b.track] ?? b.track;
  return day ? `${track} ${lang === "ar" ? "من" : "from"} ${day}` : track;
}

const STATUS: Record<Lang, Record<BookingStatus, string>> = {
  en: { confirmed: "Confirmed ✅", awaiting_payment: "Awaiting payment ⏳ (pay within the hold)", paid_conflict: "Refund pending",
    expired: "Expired", payment_failed: "Payment failed", cancelled: "Cancelled" },
  ar: { confirmed: "مؤكد ✅", awaiting_payment: "مستني الدفع ⏳ (ادفع قبل ما الحجز المؤقت يخلص)", paid_conflict: "المبلغ هيرجعلك",
    expired: "انتهى", payment_failed: "الدفع ما نجحش", cancelled: "اتلغى" },
};
export const statusLabel = (s: BookingStatus, lang: Lang) => STATUS[lang][s] ?? s;
export const refLabel = (id: string) => id.slice(0, 8).toUpperCase();
export const egpLabel = (n: number, lang: Lang) =>
  lang === "ar" ? `${new Intl.NumberFormat(LOCALE.ar).format(n)} جنيه` : `EGP ${new Intl.NumberFormat("en-GB").format(n)}`;
export function unitTitle(u: UnitTitles | null, lang: Lang): string {
  const t = u ? (lang === "ar" ? u.title_ar || u.title_en : u.title_en || u.title_ar) : "";
  return t || (lang === "ar" ? "مكتب" : "Office");
}

// What the booking agent sees for one booking. No raw ids, slugs or ISO dates.
export function bookingBrief(b: Booking, u: UnitTitles | null, lang: Lang, appUrl = "", now = new Date()) {
  return {
    unit: unitTitle(u, lang), district: u?.district ?? "", when: whenLabel(b, lang, now), status: statusLabel(b.status, lang),
    total: egpLabel(b.total_egp, lang),
    ...(b.addons.length ? { addons: b.addons.map((x) => `${x.qty} x ${lang === "ar" ? x.name_ar || x.name_en : x.name_en}`) } : {}),
    ...(b.status === "awaiting_payment" && appUrl ? { pay_link: `${appUrl}/${lang}/booking/${b.id}` } : {}),
    ref: refLabel(b.id),
  };
}

// Upcoming active bookings (unpaid hold, confirmed, refund pending; today or later, or a
// monthly/long-term one) plus the 3 most recent past confirmed ones. `bookings` is newest
// first and already excludes expired/failed holds (bookingsForRenter counts those apart).
const ACTIVE = new Set<BookingStatus>(["awaiting_payment", "confirmed", "paid_conflict"]);
export function selectMyBookings(bookings: Booking[], today: string) {
  const upcoming = bookings.filter((b) => ACTIVE.has(b.status) && (b.track !== "daily" || !b.date || b.date >= today));
  const past = bookings.filter((b) => b.status === "confirmed" && b.track === "daily" && b.date && b.date < today)
    .sort((a, b) => (b.date as string).localeCompare(a.date as string)).slice(0, 3);
  return { upcoming, past };
}

// Reply language on WhatsApp: Arabic script -> ar; a real English sentence (2+ Latin words
// once emails, links and digits are removed) -> en. A message with no clear language
// ("ok", an email, a date) keeps the language of the renter's latest earlier message
// that has letters, then the fallback.
const ARABIC = /[؀-ۿ]/;
const latinWords = (t: string) =>
  t.replace(/\S+@\S+|https?:\/\/\S+/gi, " ").match(/[A-Za-z]{2,}/g)?.length ?? 0;
const letterLang = (t: string): Lang | null => (ARABIC.test(t) ? "ar" : /[A-Za-z]/.test(t.replace(/\S+@\S+|https?:\/\/\S+/gi, "")) ? "en" : null);
export function replyLang(message: string, history: { role: string; content: string }[], fallback: Lang): Lang {
  if (ARABIC.test(message)) return "ar";
  if (latinWords(message) >= 2) return "en";
  for (let i = history.length - 1; i >= 0; i--) {
    const l = history[i].role === "user" ? letterLang(history[i].content) : null;
    if (l) return l;
  }
  return letterLang(message) ?? fallback;
}
