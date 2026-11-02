// Booking agent: Egyptian-Arabic chat with native tool calling (DESIGN §5).
// Chat text is PII -> meta.product only, never contributor (AGENTS.md).
// Tool arguments are validated in code; bad args go back to the model as an
// error result, never a 500. At most MAX_ROUNDS tool rounds per turn.
import { meta } from "../meta/client";
import { AGENT_CHANNEL_WEB, AGENT_CHANNEL_WHATSAPP, AGENT_PROMPT_V4 } from "../meta/prompts";
import { pool } from "../db/pg";
import { listUnits, getUnit, unitId, freeDays, availabilityByDay, todayCairo, bookingsForRenter, type Booking, type Unit } from "../db/store";
import { phoneFromWaId } from "../whatsapp";
import { createBooking } from "../booking";
import { VENUE_ADDONS } from "../addons/catalog";
import { nearbyOf } from "../nearby";
import { haversineM } from "../places";
import { findLandmark, LANDMARKS } from "../landmarks";
import { USES, type UseVerdict } from "../pipeline/rubric";

const MAX_ROUNDS = 6;
export type Channel = "chat" | "whatsapp";
// WhatsApp only: the verified sender (wa_id from the signed webhook) and their profile name.
export interface Sender { waId: string; name: string | null }
// A unit the agent looked at this turn, for photo cards under the reply (web) or image messages (WhatsApp).
export interface UnitCard { slug: string; title_en: string; title_ar: string; district: string; rent_egp: number; daily_egp: number | null; image: string; synthetic: boolean }
type Ctx = { bookingId?: string; total?: number; channel: Channel; sender?: Sender; cards: Map<string, UnitCard> };
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
    use: { type: "string", enum: [...USES], description: "Intended use; only units whose layout suits it are returned" },
    min_desks: { type: "integer", minimum: 1 }, max_rent_egp: { type: "integer", description: "Monthly budget in EGP" },
    track: { type: "string", enum: ["daily", "monthly", "long_term"] } } } } },
  { type: "function", function: { name: "get_unit", description: "Details of one unit: summary, specs, suitable uses with reasons, next free days.", parameters: { type: "object", additionalProperties: false, required: ["slug"], properties: { slug: { type: "string" } } } } },
  { type: "function", function: { name: "nearby_places", description: "Cafes and restaurants within 1 km of a unit, with their menu items (ids and prices) that can be added to a day booking, plus venue add-ons.", parameters: { type: "object", additionalProperties: false, required: ["slug"], properties: { slug: { type: "string" } } } } },
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
const km = (m: number) => Math.round(m / 100) / 10;
const venue = () => VENUE_ADDONS.map((x) => ({ id: x.id, en: x.name_en, ar: x.name_ar, egp: x.price_egp }));
const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

async function runTool(name: string, rawArgs: string, ctx: Ctx): Promise<unknown> {
  let a: Record<string, unknown>;
  try { a = JSON.parse(rawArgs || "{}"); } catch { return { error: "arguments must be JSON" }; }
  if (name === "search_units") {
    const district = str(a.district)?.toLowerCase(); const use = USES.find((x) => x === a.use);
    const nearText = str(a.near); const landmark = nearText ? findLandmark(nearText) : null;
    if (nearText && !landmark) return { error: `unknown landmark "${nearText}"; use district instead, or one of these`, known_landmarks: LANDMARKS.map((l) => l.name_en) };
    const minDesks = Number.isInteger(a.min_desks) ? (a.min_desks as number) : null;
    const maxRent = Number.isInteger(a.max_rent_egp) ? (a.max_rent_egp as number) : null;
    const track = ["daily", "monthly", "long_term"].find((x) => x === a.track);
    const matches = (await listUnits()).filter((u) =>
      (!district || `${u.district} ${u.title_en}`.toLowerCase().includes(district)) &&
      // Units not yet assessed by the rubric stay eligible for plain office/meeting searches only.
      (!use || passingUses(u).some((x) => x.use === use) || (!Array.isArray(u.specs.uses) && (use === "office" || use === "meeting"))) &&
      (!minDesks || (deskCap(u) ?? 0) >= minDesks) && (!maxRent || u.rent_egp <= maxRent));
    const onTrack = (u: Unit) => !track || u.rent_periods.includes(track as Unit["rent_periods"][number]);
    const dist = (u: Unit) => (landmark && u.location ? haversineM(landmark.at, u.location) : Infinity);
    const units = matches.filter(onTrack).filter((u) => !landmark || u.location).sort((x, y) => dist(x) - dist(y));
    // Units that match everything but the rental track, so the agent can explain (e.g. long-term only).
    const otherTrack = matches.filter((u) => !onTrack(u)).slice(0, 3).map((u) => ({ slug: u.slug, district: u.district, kind: u.kind, tracks: u.rent_periods, rent_egp_month: u.rent_egp }));
    return { count: units.length, ...(landmark ? { near: landmark.name_en, distance: "straight line, approximate" } : {}),
      units: (addCards(ctx, units.slice(0, 5)), units.slice(0, 5).map((u) => ({ ...brief(u), ...(landmark ? { km_from_landmark: km(dist(u)) } : {}) }))),
      ...(otherTrack.length ? { matching_other_tracks: otherTrack } : {}) };
  }
  if (name === "get_unit") {
    const u = str(a.slug) ? await getUnit(a.slug as string) : null;
    if (!u) return { error: "unit not found" };
    addCards(ctx, [u]);
    return { ...brief(u), summary_en: u.summary_en, summary_ar: u.summary_ar, highlights_en: u.highlights_en,
      specs: { area_m2: u.specs.area_m2_estimate, rooms: u.specs.rooms_count, bathrooms: u.specs.bathrooms_count, natural_light: u.specs.natural_light, condition: u.specs.condition },
      use_reasons: passingUses(u).map((x) => ({ use: x.use, verdict: x.verdict, why: x.reasons_en.join(" ") })),
      next_free_days: u.rent_periods.includes("daily") ? await freeDays(u.slug, 10) : "long-term/monthly: starts from available_from" };
  }
  if (name === "nearby_places") {
    const u = str(a.slug) ? await getUnit(a.slug as string) : null;
    const id = u ? await unitId(u.slug) : null;
    if (!u || !id) return { error: "unit not found" };
    const daily = u.rent_periods.includes("daily") && !!u.daily_egp;
    const places = (await nearbyOf(id)).map((p) => ({
      name: p.name, distance_m: p.distance_m, brand: p.brand,
      ...(p.items.length ? (daily ? { menu: p.items.map((it) => ({ id: it.id, en: it.name_en, ar: it.name_ar, size: it.size, egp: it.price_egp })) } : { menu_listed: true }) : { menu_listed: false }),
    }));
    return { places, menu_addons: daily ? "menu items can be added to a day booking by id" : "info only: this unit is not day-bookable, so no food add-ons; the renter orders directly",
      venue_addons: venue(), source: "menus from elmenus.com (demo data, not affiliated); places from Google Maps" };
  }
  if (name === "check_availability") {
    const slug = str(a.slug); const date = str(a.date, 10);
    if (!slug || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "slug and date YYYY-MM-DD required" };
    if (date < todayCairo()) return { error: "date is in the past", today: todayCairo() };
    const u = await getUnit(slug); if (!u) return { error: "unit not found" };
    if (!u.rent_periods.includes("daily")) return { daily_bookable: false, reason: "semifinished units are long-term only" };
    const day = (await availabilityByDay(slug)).find((d) => d.date === date);
    return { date, free: day?.day_free ?? false, daily_egp: u.daily_egp, next_free_days: await freeDays(slug, 5) };
  }
  if (name === "create_booking") {
    try {
      const b = await createBooking({
        unit_slug: String(a.slug ?? ""), date: String(a.date ?? ""), track: ["daily", "monthly", "long_term"].find((x) => x === a.track) as Unit["rent_periods"][number] | undefined,
        renter_name: String(a.renter_name ?? "").trim() || ctx.sender?.name || "", renter_email: String(a.renter_email ?? ""),
        ...(ctx.sender ? { wa_id: ctx.sender.waId } : { renter_phone: String(a.renter_phone ?? "").replace(/\D/g, "") }),
        addons: Array.isArray(a.addons) ? (a.addons as { item_id: string; qty: number }[]).slice(0, 10) : [],
        created_via: ctx.channel,
      });
      ctx.bookingId = b.id; ctx.total = b.total_egp;
      return { booking_ref: b.id.slice(0, 8), status: b.status, total_egp: b.total_egp, hold_minutes: 30 };
    } catch (e) { return { error: (e as Error).message }; }
  }
  if (name === "my_bookings") {
    if (!ctx.sender) return { error: "only available on WhatsApp" };
    return { bookings: (await senderBookings(ctx.sender)).map(bookingBrief) };
  }
  return { error: `unknown tool ${name}` };
}

const senderBookings = (s: Sender) => bookingsForRenter(s.waId, phoneFromWaId(s.waId));
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";
function bookingBrief(b: Booking) {
  return { ref: b.id.slice(0, 8), unit: b.unit_slug, track: b.track, date: b.date, status: b.status, total_egp: b.total_egp,
    addons: b.addons.map((x) => `${x.qty} x ${x.name_en}`), ...(b.status === "awaiting_payment" && appUrl() ? { pay_link: `${appUrl()}/ar/booking/${b.id}` } : {}) };
}
// Upcoming bookings that still matter: unpaid (held) or confirmed, today or later.
const ACTIVE = new Set(["awaiting_payment", "confirmed", "paid_conflict"]);
async function channelBlock(ctx: Ctx): Promise<string> {
  if (!ctx.sender) return AGENT_CHANNEL_WEB;
  const today = todayCairo();
  const upcoming = (await senderBookings(ctx.sender)).filter((b) => ACTIVE.has(b.status) && (!b.date || b.date >= today)).map(bookingBrief);
  return AGENT_CHANNEL_WHATSAPP.replace("{PHONE}", phoneFromWaId(ctx.sender.waId) ?? ctx.sender.waId)
    .replace("{NAME}", ctx.sender.name ?? "unknown, ask for it").replace("{BOOKINGS}", upcoming.length ? JSON.stringify(upcoming) : "none upcoming");
}

async function systemPrompt(ctx: Ctx): Promise<string> {
  const today = todayCairo();
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "long" }).format(new Date());
  return AGENT_PROMPT_V4.replace("{TODAY}", today).replace("{WEEKDAY}", weekday).replace("{TOMORROW}", tomorrow).replace("{CHANNEL}", await channelBlock(ctx));
}

async function loadHistory(sessionKey: string): Promise<{ role: string; content: string }[]> {
  const { rows } = await pool().query<{ messages: { role: string; content: string }[] }>("select messages from chat_sessions where session_key = $1", [sessionKey]);
  return rows[0]?.messages ?? [];
}
async function saveHistory(sessionKey: string, messages: { role: string; content: string }[], trace: unknown[]) {
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

export async function chatTurn(sessionId: string, message: string, channel: Channel = "chat", sender?: Sender): Promise<{ reply: string; booking_id?: string; total_egp?: number; units: UnitCard[] }> {
  const history = (await loadHistory(sessionId)).slice(-10);
  const ctx: Ctx = { channel, cards: new Map(), ...(channel === "whatsapp" && sender ? { sender } : {}) };
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
  if (!reply) reply = "معلش، حصلت مشكلة صغيرة. ممكن تعيد اللي كنت بتقوله؟";
  await saveHistory(sessionId, [...history, { role: "user", content: message }, { role: "assistant", content: reply }], trace);
  // No cards once a booking is made: the reply is about payment then.
  const units = ctx.bookingId ? [] : cardsFor(reply, [...ctx.cards.values()]);
  return { reply, units, ...(ctx.bookingId ? { booking_id: ctx.bookingId, total_egp: ctx.total } : {}) };
}
