// Booking agent: Egyptian-Arabic chat with native tool calling (DESIGN §5).
// Chat text is PII -> meta.product only, never contributor (AGENTS.md).
// Tool arguments are validated in code; bad args go back to the model as an
// error result, never a 500. At most MAX_ROUNDS tool rounds per turn.
import { meta } from "../meta/client";
import { AGENT_CHANNEL_WEB, AGENT_CHANNEL_WHATSAPP, AGENT_PROMPT_V10, NEAR_ME_ASK_WEB, NEAR_ME_ASK_WHATSAPP, NEAR_ME_MARKER } from "../meta/prompts";
import { pool } from "../db/pg";
import { listUnits, getUnit, unitId, freeDays, availabilityByDay, todayCairo, bookingsForRenter, hiddenHoldsForRenter, type Booking, type Unit } from "../db/store";
import { phoneFromWaId, senderKey } from "../whatsapp";
import { limitKey } from "../guard";
import { createBooking } from "../booking";
import { bookingBrief, refLabel, replyLang, selectMyBookings, type Lang, type UnitTitles } from "../booking-labels";
import { HOUSE_ADDONS, VENUE_ADDONS, type AddonCatalogItem } from "../addons/catalog";
import { nearbyOf, roundDistanceM } from "../nearby";
import { haversineM } from "../places";
import { findLandmark, LANDMARKS } from "../landmarks";
import type { LatLng } from "../geo";
import { USES, type UseVerdict } from "../pipeline/rubric";

const MAX_ROUNDS = 6;
// Empty model answer: a fixed line in the page (web) or message (WhatsApp) language.
const FALLBACK_REPLY = { ar: "معلش، حصلت مشكلة صغيرة. ممكن تعيد اللي كنت بتقوله؟", en: "Sorry, something went wrong. Could you say that again?" } as const;
export type Channel = "chat" | "whatsapp";
// WhatsApp only: the verified sender (wa_id from the signed webhook) and their profile name.
export interface Sender { waId: string; name: string | null }
// A unit the agent looked at this turn, for photo cards under the reply (web) or image messages (WhatsApp).
export interface UnitCard { slug: string; title_en: string; title_ar: string; district: string; rent_egp: number; daily_egp: number | null; image: string; synthetic: boolean }
// lang: default reply language; pageLang: language of booking-page links (follows the message on WhatsApp).
// location: the renter's near-me point (rounded; set by the server from 📍 or a WhatsApp pin, never by the model).
// bookingKey: the caller's limit key for create_booking (hashed IP on the web, the sender on WhatsApp).
type Ctx = { bookingId?: string; total?: number; bookingKey: string; channel: Channel; sender?: Sender; cards: Map<string, UnitCard>; lang: "ar" | "en"; pageLang: "ar" | "en"; location: LatLng | null };
const cardOf = (u: Unit): UnitCard | null => {
  const image = u.images.real || u.images.staged[0]?.url || "";
  return image ? { slug: u.slug, title_en: u.title_en, title_ar: u.title_ar, district: u.district, rent_egp: u.rent_egp, daily_egp: u.daily_egp, image, synthetic: u.synthetic } : null;
};
const addCards = (ctx: Ctx, units: Unit[]) => { for (const u of units) { const c = cardOf(u); if (c && !ctx.cards.has(c.slug)) ctx.cards.set(c.slug, c); } };
// Cards for the units the reply names (district or price), else the first results; at most 3.
function cardsFor(reply: string, cards: UnitCard[]): UnitCard[] {
  const text = reply.toLowerCase().replace(/[,٬]/g, "");
  const named = cards.filter((c) => text.includes(c.district.split("(")[0].trim().toLowerCase()) || text.includes(c.slug)
    || [c.daily_egp, c.rent_egp].some((n) => n && text.includes(String(n))));
  return (named.length ? named : cards).slice(0, 3);
}
type Msg = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }

const TOOLS = [
  { type: "function", function: { name: "search_units", description: "Search ready office units. All filters optional.", parameters: { type: "object", additionalProperties: false, properties: {
    district: { type: "string", description: "District or city in English, e.g. Zamalek, New Cairo, Alexandria" },
    near: { type: "string", description: "A landmark the renter wants to be close to (university, mall, airport, square), e.g. AUC, City Stars, Smart Village. Results are sorted by distance to it." },
    near_me: { type: "boolean", description: "true when the renter wants offices near their own location (\"near me\", \"قريب مني\"). The server supplies the location; never pass coordinates." },
    radius_km: { type: "number", minimum: 1, maximum: 50, description: "With near_me: search radius in km (default 10)" },
    use: { type: "string", enum: [...USES], description: "Intended use; only units whose layout suits it are returned" },
    min_desks: { type: "integer", minimum: 1 }, max_rent_egp: { type: "integer", description: "Monthly budget in EGP" },
    track: { type: "string", enum: ["daily", "monthly", "long_term"] } } } } },
  { type: "function", function: { name: "get_unit", description: "Details of one unit: summary, specs, suitable uses with reasons, next free days.", parameters: { type: "object", additionalProperties: false, required: ["slug"], properties: { slug: { type: "string" } } } } },
  { type: "function", function: { name: "nearby_places", description: "Cafes and restaurants within 1 km of a unit (name, distance, Google Maps link; the renter orders from them directly), plus the add-ons provided by the venue: house coffee & snacks (day bookings only) and venue items, with ids and prices.", parameters: { type: "object", additionalProperties: false, required: ["slug"], properties: { slug: { type: "string" } } } } },
  { type: "function", function: { name: "check_availability", description: "Whether a day is free for a daily booking, plus the next free days.", parameters: { type: "object", additionalProperties: false, required: ["slug", "date"], properties: { slug: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } } } } },
  { type: "function", function: { name: "create_booking", description: "Book after the renter confirmed. Creates an unpaid booking held 30 minutes; payment happens on the booking page.", parameters: { type: "object", additionalProperties: false, required: ["slug", "date", "renter_name", "renter_email"], properties: {
    slug: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD (first day for monthly/long-term)" },
    track: { type: "string", enum: ["daily", "monthly", "long_term"] }, renter_name: { type: "string" },
    renter_phone: { type: "string", description: "Egyptian mobile 01xxxxxxxxx (website chat only; omit on WhatsApp)" }, renter_email: { type: "string" },
    addons: { type: "array", items: { type: "object", additionalProperties: false, required: ["item_id", "qty"], properties: { item_id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 20 } } } } } } } },
];

const MY_BOOKINGS = { type: "function", function: { name: "my_bookings", description: "The renter's own bookings (newest first) with status and, for unpaid ones, the payment link. WhatsApp only.", parameters: { type: "object", additionalProperties: false, properties: {} } } };
const toolsFor = (ctx: Ctx) => (ctx.sender ? [...TOOLS, MY_BOOKINGS] : TOOLS);

const passingUses = (u: Unit) => ((u.specs.uses as UseVerdict[] | undefined) ?? []).filter((x) => x.verdict !== "not_suitable");
const deskCap = (u: Unit) => passingUses(u).find((x) => x.use === "office")?.capacity?.desks_max ?? (u.specs.desk_capacity as number | null) ?? null;
const brief = (u: Unit) => ({
  slug: u.slug, title_en: u.title_en, title_ar: u.title_ar, kind: u.kind, district: u.district, floor: u.floor_text,
  rent_egp_month: u.rent_egp, daily_egp: u.daily_egp, tracks: u.rent_periods, area_m2: u.specs.area_m2_estimate ?? null,
  rooms: u.specs.rooms_count ?? null, desks_max: deskCap(u), uses: passingUses(u).map((x) => `${x.use}:${x.verdict}`), synthetic_photos: u.synthetic,
});
// "Downtown Cairo" or "Smouha, Alexandria" must still match "Downtown" / "Smouha": try the whole
// phrase, then the phrase without a city/country word (but "New Cairo" keeps "cairo" when alone).
const PLACE_NOISE = /\b(cairo|giza|alexandria|alex|egypt)\b|[,،]/g;
function districtMatches(haystack: string, district: string): boolean {
  const h = haystack.toLowerCase();
  if (h.includes(district)) return true;
  const core = district.replace(PLACE_NOISE, " ").replace(/\s+/g, " ").trim();
  return core.length >= 3 && core !== "new" && h.includes(core);
}
const km = (m: number) => Math.round(m / 100) / 10;
const addonBrief = (list: AddonCatalogItem[]) => list.map((x) => ({ id: x.id, en: x.name_en, ar: x.name_ar, egp: x.price_egp }));
const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

// Guest drafts (not published) are invisible to the agent: same as not found.
async function listedUnit(slug: string): Promise<Unit | null> {
  const u = await getUnit(slug);
  return u && !u.draft ? u : null;
}
type Filter = [name: string, test: (u: Unit) => boolean];
// near_me radius: 1-50 km, default 10.
export const radiusKm = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(50, Math.max(1, v)) : 10);
const nearBrief = (u: Unit, m: number) => ({ ...brief(u), distance_km: km(m), ...(u.location?.approx ? { location_approx: "approximate area, not the exact building" } : {}) });
// Filters that alone leave no unit with a location; all of them together when no single one does.
export function blockedBy(filters: Filter[], located: Unit[]): string[] {
  const alone = filters.filter(([, f]) => !located.some(f)).map(([n]) => n);
  return alone.length ? alone : filters.length ? [`combination of ${filters.map(([n]) => n).join(" + ")}`] : [];
}
// near_me: units within the radius sorted by distance; else the 3 nearest that pass the other filters.
export function nearMeResult(units: Unit[], dist: (u: Unit) => number, radius: number, ctx: Ctx, otherTrack: unknown[], blocked: () => string[]) {
  const base = { near_me: true, radius_km: radius, distance: "straight line, approximate" };
  const extra = otherTrack.length ? { matching_other_tracks: otherTrack } : {};
  const inRadius = units.filter((u) => dist(u) <= radius * 1000);
  if (inRadius.length) {
    const top = inRadius.slice(0, 5); addCards(ctx, top);
    return { ...base, count: inRadius.length, units: top.map((u) => nearBrief(u, dist(u))), ...extra };
  }
  const nearest = units.slice(0, 3); addCards(ctx, nearest);
  const blockedNames = nearest.length ? [] : blocked();
  return { ...base, in_radius: 0, nearest: nearest.map((u) => nearBrief(u, dist(u))),
    ...(blockedNames.length ? { no_units_match_filters: blockedNames } : {}), ...extra };
}

async function runTool(name: string, rawArgs: string, ctx: Ctx): Promise<unknown> {
  let a: Record<string, unknown>;
  try { a = JSON.parse(rawArgs || "{}"); } catch { return { error: "arguments must be JSON" }; }
  if (name === "search_units") {
    const district = str(a.district)?.toLowerCase(); const use = USES.find((x) => x === a.use);
    const nearText = str(a.near); const nearMe = a.near_me === true;
    if (nearText && nearMe) return { error: "use near (a named landmark) or near_me (the renter's own location), not both" };
    const landmark = nearText ? findLandmark(nearText) : null;
    if (nearText && !landmark) return { error: `unknown landmark "${nearText}"; use district instead, or one of these`, known_landmarks: LANDMARKS.map((l) => l.name_en) };
    if (nearMe && !ctx.location) return { error: "NO_LOCATION", ask: ctx.channel === "whatsapp" ? NEAR_ME_ASK_WHATSAPP : NEAR_ME_ASK_WEB };
    const minDesks = Number.isInteger(a.min_desks) ? (a.min_desks as number) : null;
    const maxRent = Number.isInteger(a.max_rent_egp) ? (a.max_rent_egp as number) : null;
    const track = ["daily", "monthly", "long_term"].find((x) => x === a.track);
    const onTrack = (u: Unit) => !track || u.rent_periods.includes(track as Unit["rent_periods"][number]);
    // Named filters, so a near-me search that finds nothing can say which one excluded everything.
    const filters: Filter[] = [];
    if (district) filters.push(["district", (u) => districtMatches(`${u.district} ${u.title_en}`, district)]);
    // Units not yet assessed by the rubric stay eligible for plain office/meeting searches only.
    if (use) filters.push(["use", (u) => passingUses(u).some((x) => x.use === use) || (!Array.isArray(u.specs.uses) && (use === "office" || use === "meeting"))]);
    if (minDesks) filters.push(["min_desks", (u) => (deskCap(u) ?? 0) >= minDesks]);
    if (maxRent) filters.push(["max_rent_egp", (u) => u.rent_egp <= maxRent]);
    const all = await listUnits();
    const matches = all.filter((u) => filters.every(([, f]) => f(u)));
    const origin = nearMe ? ctx.location : landmark?.at ?? null;
    const dist = (u: Unit) => (origin && u.location ? haversineM(origin, u.location) : Infinity);
    const units = matches.filter(onTrack).filter((u) => !origin || u.location).sort((x, y) => dist(x) - dist(y));
    // Units that match everything but the rental track, so the agent can explain (e.g. long-term only).
    const otherTrack = matches.filter((u) => !onTrack(u)).slice(0, 3).map((u) => ({ slug: u.slug, district: u.district, kind: u.kind, tracks: u.rent_periods, rent_egp_month: u.rent_egp }));
    if (nearMe) return nearMeResult(units, dist, radiusKm(a.radius_km), ctx, otherTrack,
      () => blockedBy(track ? [...filters, ["track", onTrack]] : filters, all.filter((u) => u.location)));
    return { count: units.length, ...(landmark ? { near: landmark.name_en, distance: "straight line, approximate" } : {}),
      units: (addCards(ctx, units.slice(0, 5)), units.slice(0, 5).map((u) => ({ ...brief(u), ...(landmark ? { km_from_landmark: km(dist(u)) } : {}) }))),
      ...(otherTrack.length ? { matching_other_tracks: otherTrack } : {}) };
  }
  if (name === "get_unit") {
    const u = str(a.slug) ? await listedUnit(a.slug as string) : null;
    if (!u) return { error: "unit not found" };
    addCards(ctx, [u]);
    return { ...brief(u), summary_en: u.summary_en, summary_ar: u.summary_ar, highlights_en: u.highlights_en,
      specs: { area_m2: u.specs.area_m2_estimate, rooms: u.specs.rooms_count, bathrooms: u.specs.bathrooms_count, natural_light: u.specs.natural_light, condition: u.specs.condition },
      use_reasons: passingUses(u).map((x) => ({ use: x.use, verdict: x.verdict, why: x.reasons_en.join(" ") })),
      next_free_days: u.rent_periods.includes("daily") ? await freeDays(u.slug, 10) : "long-term/monthly: starts from available_from" };
  }
  if (name === "nearby_places") {
    const u = str(a.slug) ? await listedUnit(a.slug as string) : null;
    const id = u ? await unitId(u.slug) : null;
    if (!u || !id) return { error: "unit not found" };
    const daily = u.rent_periods.includes("daily") && !!u.daily_egp;
    const places = (await nearbyOf(id)).map((p) => ({ name: p.name ?? "unnamed place (name on the Maps link)", distance_m: roundDistanceM(p.distance_m), maps_url: p.maps_url }));
    return { places, places_note: "info only: the renter orders from these places directly; places from Google Maps",
      ...(daily ? { house_addons: addonBrief(HOUSE_ADDONS) } : { house_addons_note: "this unit is not day-bookable, so no coffee or snack add-ons" }),
      venue_addons: addonBrief(VENUE_ADDONS) };
  }
  if (name === "check_availability") {
    const slug = str(a.slug); const date = str(a.date, 10);
    if (!slug || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "slug and date YYYY-MM-DD required" };
    if (date < todayCairo()) return { error: "date is in the past", today: todayCairo() };
    const u = await listedUnit(slug); if (!u) return { error: "unit not found" };
    if (!u.rent_periods.includes("daily")) return { daily_bookable: false, reason: "semifinished units are long-term only" };
    const day = (await availabilityByDay(slug)).find((d) => d.date === date);
    return { date, free: day?.day_free ?? false, daily_egp: u.daily_egp, next_free_days: await freeDays(slug, 5) };
  }
  if (name === "create_booking") {
    // One booking per turn, and the same daily booking cap as /api/bookings, before any write.
    if (ctx.bookingId) return { error: "BOOKING_LIMIT_PER_TURN", note: "one booking was already created this turn; give the renter its link and ask them to pay or confirm before booking another" };
    const allowed = await limitKey("booking", ctx.bookingKey);
    if (!allowed.ok) return { error: allowed.code, note: "booking limit reached for today; tell the renter they can't make more bookings now and should try again tomorrow" };
    try {
      const b = await createBooking({
        unit_slug: String(a.slug ?? ""), date: String(a.date ?? ""), track: ["daily", "monthly", "long_term"].find((x) => x === a.track) as Unit["rent_periods"][number] | undefined,
        renter_name: String(a.renter_name ?? "").trim() || ctx.sender?.name || "", renter_email: String(a.renter_email ?? ""),
        ...(ctx.sender ? { wa_id: ctx.sender.waId } : { renter_phone: String(a.renter_phone ?? "").replace(/\D/g, "") }),
        addons: Array.isArray(a.addons) ? (a.addons as { item_id: string; qty: number }[]).slice(0, 10) : [],
        created_via: ctx.channel,
      });
      ctx.bookingId = b.id; ctx.total = b.total_egp;
      return { booking_ref: refLabel(b.id), status: b.status, total_egp: b.total_egp, hold_minutes: 30 };
    } catch (e) { return { error: (e as Error).message }; }
  }
  if (name === "my_bookings") {
    if (!ctx.sender) return { error: "only available on WhatsApp" };
    const [v, hidden] = await Promise.all([myBookings(ctx.sender, ctx.pageLang), hiddenHoldsForRenter(ctx.sender.waId, phoneFromWaId(ctx.sender.waId))]);
    return { bookings: v.upcoming, recent_past: v.past, hidden_expired: hidden };
  }
  return { error: `unknown tool ${name}` };
}

const senderBookings = (s: Sender) => bookingsForRenter(s.waId, phoneFromWaId(s.waId));
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";
// Unit titles for a renter's bookings (one lookup per unit).
async function titlesFor(bookings: Booking[]): Promise<Map<string, UnitTitles | null>> {
  const slugs = [...new Set(bookings.map((b) => b.unit_slug))];
  const units = await Promise.all(slugs.map((s) => getUnit(s)));
  return new Map(slugs.map((s, i) => [s, units[i]]));
}
// Friendly view of the sender's bookings in the reply language (lib/booking-labels.ts).
async function myBookings(s: Sender, lang: Lang) {
  const { upcoming, past } = selectMyBookings(await senderBookings(s), todayCairo());
  const titles = await titlesFor([...upcoming, ...past]);
  const brief = (b: Booking) => bookingBrief(b, titles.get(b.unit_slug) ?? null, lang, appUrl());
  return { upcoming: upcoming.map(brief), past: past.map(brief) };
}
async function channelBlock(ctx: Ctx): Promise<string> {
  if (!ctx.sender) return AGENT_CHANNEL_WEB;
  const { upcoming } = await myBookings(ctx.sender, ctx.pageLang);
  return AGENT_CHANNEL_WHATSAPP.replace("{PHONE}", phoneFromWaId(ctx.sender.waId) ?? ctx.sender.waId)
    .replace("{NAME}", ctx.sender.name ?? "unknown, ask for it").replace("{BOOKINGS}", upcoming.length ? JSON.stringify(upcoming) : "none upcoming");
}

async function systemPrompt(ctx: Ctx): Promise<string> {
  const today = todayCairo();
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "long" }).format(new Date());
  return AGENT_PROMPT_V10.replace("{LANG}", ctx.lang === "en" ? "English" : "Egyptian Arabic").replace("{TODAY}", today).replace("{WEEKDAY}", weekday).replace("{TOMORROW}", tomorrow).replace("{CHANNEL}", await channelBlock(ctx));
}

// Stored history. A user message may carry `loc`, the session's near-me point (rounded); it lives
// in chat_sessions.messages (no extra column) and is stripped before the model sees the history.
type Stored = { role: string; content: string; loc?: LatLng };
async function loadHistory(sessionKey: string): Promise<Stored[]> {
  const { rows } = await pool().query<{ messages: Stored[] }>("select messages from chat_sessions where session_key = $1", [sessionKey]);
  return rows[0]?.messages ?? [];
}
// Latest near-me point in the session. It is carried onto every later user message, so trimming keeps it.
export function sessionLocation(history: Stored[]): LatLng | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const l = history[i].loc;
    if (l && Number.isFinite(l.lat) && Number.isFinite(l.lng)) return { lat: l.lat, lng: l.lng };
  }
  return null;
}
async function saveHistory(sessionKey: string, messages: Stored[], trace: unknown[]) {
  await pool().query(
    `insert into chat_sessions (session_key, messages, tool_calls, turns) values ($1, $2, $3, 1)
     on conflict (session_key) do update set messages = excluded.messages,
       tool_calls = (chat_sessions.tool_calls || excluded.tool_calls), turns = chat_sessions.turns + 1, updated_at = now()`,
    [sessionKey, JSON.stringify(messages.slice(-20)), JSON.stringify(trace)]);
}
// Renter turns in this session so far (capped in the chat route).
export async function sessionTurns(sessionKey: string): Promise<number> {
  const { rows } = await pool().query<{ turns: number }>("select turns from chat_sessions where session_key = $1", [sessionKey]);
  return rows[0]?.turns ?? 0;
}

// lang: the page language for web chat (default reply language); WhatsApp starts in Arabic.
// location: a near-me point already validated and rounded by the route (lib/geo renterLocation);
// it becomes the session's location. An empty message with a location turns into a neutral 📍 marker.
// bookingKey: the web caller's limit key (lib/web-chat: hashed IP); WhatsApp uses the sender's key.
export async function chatTurn(sessionId: string, message: string, channel: Channel = "chat", sender?: Sender, lang: "ar" | "en" = "ar", location?: LatLng, bookingKey?: string): Promise<{ reply: string; lang: "ar" | "en"; booking_id?: string; total_egp?: number; units: UnitCard[] }> {
  const stored = await loadHistory(sessionId);
  const history = stored.slice(-10).map(({ role, content }) => ({ role, content }));
  if (location && !message.trim()) message = NEAR_ME_MARKER[replyLang("", history, channel === "whatsapp" ? "ar" : lang)];
  // WhatsApp: follow the renter's message; "ok" or a bare email keeps the session's language.
  const pageLang = channel === "whatsapp" ? replyLang(message, history, "ar") : lang;
  const key = channel === "whatsapp" ? senderKey(sessionId) : bookingKey ?? `session:${sessionId}`;
  const ctx: Ctx = { channel, bookingKey: key, cards: new Map(), lang: channel === "whatsapp" ? "ar" : lang, pageLang, location: location ?? sessionLocation(stored),
    ...(channel === "whatsapp" && sender ? { sender } : {}) };
  const msgs: Msg[] = [{ role: "system", content: await systemPrompt(ctx) }, ...history, { role: "user", content: message }];
  const trace: unknown[] = [];
  let reply = "";
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const r = (await meta.product.chat({
      messages: msgs, temperature: 0.3, reasoning_effort: "low",
      ...(round < MAX_ROUNDS ? { tools: toolsFor(ctx), tool_choice: "auto" } : {}), // last round: force a text answer
    })) as { choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
    const m = r.choices?.[0]?.message;
    if (m?.tool_calls?.length) {
      msgs.push({ role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls });
      for (const call of m.tool_calls) {
        const result = await runTool(call.function.name, call.function.arguments, ctx);
        trace.push({ tool: call.function.name, args: call.function.arguments, ok: !(result as { error?: string }).error });
        msgs.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    reply = (m?.content ?? "").trim();
    break;
  }
  if (!reply) reply = FALLBACK_REPLY[pageLang];
  await saveHistory(sessionId, [...history, { role: "user", content: message, ...(ctx.location ? { loc: ctx.location } : {}) }, { role: "assistant", content: reply }], trace);
  // No cards once a booking is made: the reply is about payment then.
  const units = ctx.bookingId ? [] : cardsFor(reply, [...ctx.cards.values()]);
  return { reply, lang: pageLang, units, ...(ctx.bookingId ? { booking_id: ctx.bookingId, total_egp: ctx.total } : {}) };
}
