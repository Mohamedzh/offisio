// Booking agent: Egyptian-Arabic chat with native tool calling (DESIGN §5).
// Chat text is PII -> meta.product only, never contributor (AGENTS.md).
// Tool arguments are validated in code; bad args go back to the model as an
// error result, never a 500. At most MAX_ROUNDS tool rounds per turn.
import { meta } from "../meta/client";
import { AGENT_PROMPT_V2 } from "../meta/prompts";
import { pool } from "../db/pg";
import { listUnits, getUnit, freeDays, availabilityByDay, todayCairo, type Unit } from "../db/store";
import { createBooking } from "../booking";
import { ADDON_CATALOG } from "../addons/catalog";
import { USES, type UseVerdict } from "../pipeline/rubric";

const MAX_ROUNDS = 6;
type Msg = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }

const TOOLS = [
  { type: "function", function: { name: "search_units", description: "Search ready office units. All filters optional.", parameters: { type: "object", additionalProperties: false, properties: {
    district: { type: "string", description: "District or city in English, e.g. Zamalek, New Cairo, Alexandria" },
    use: { type: "string", enum: [...USES], description: "Intended use; only units whose layout suits it are returned" },
    min_desks: { type: "integer", minimum: 1 }, max_rent_egp: { type: "integer", description: "Monthly budget in EGP" },
    track: { type: "string", enum: ["daily", "monthly", "long_term"] } } } } },
  { type: "function", function: { name: "get_unit", description: "Details of one unit: summary, specs, suitable uses with reasons, next free days.", parameters: { type: "object", additionalProperties: false, required: ["slug"], properties: { slug: { type: "string" } } } } },
  { type: "function", function: { name: "check_availability", description: "Whether a day is free for a daily booking, plus the next free days.", parameters: { type: "object", additionalProperties: false, required: ["slug", "date"], properties: { slug: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } } } } },
  { type: "function", function: { name: "create_booking", description: "Book after the renter confirmed. Creates an unpaid booking held 30 minutes; payment happens on the booking page.", parameters: { type: "object", additionalProperties: false, required: ["slug", "date", "renter_name", "renter_phone"], properties: {
    slug: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD (first day for monthly/long-term)" },
    track: { type: "string", enum: ["daily", "monthly", "long_term"] }, renter_name: { type: "string" }, renter_phone: { type: "string", description: "Egyptian mobile 01xxxxxxxxx" },
    addons: { type: "array", items: { type: "object", additionalProperties: false, required: ["item_id", "qty"], properties: { item_id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 20 } } } } } } } },
];

const passingUses = (u: Unit) => ((u.specs.uses as UseVerdict[] | undefined) ?? []).filter((x) => x.verdict !== "not_suitable");
const deskCap = (u: Unit) => passingUses(u).find((x) => x.use === "office")?.capacity?.desks_max ?? (u.specs.desk_capacity as number | null) ?? null;
const brief = (u: Unit) => ({
  slug: u.slug, title_en: u.title_en, title_ar: u.title_ar, kind: u.kind, district: u.district, floor: u.floor_text,
  rent_egp_month: u.rent_egp, daily_egp: u.daily_egp, tracks: u.rent_periods, area_m2: u.specs.area_m2_estimate ?? null,
  rooms: u.specs.rooms_count ?? null, desks_max: deskCap(u), uses: passingUses(u).map((x) => `${x.use}:${x.verdict}`), synthetic_photos: u.synthetic,
});
const str = (v: unknown, max = 80) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

async function runTool(name: string, rawArgs: string, ctx: { bookingId?: string; total?: number }): Promise<unknown> {
  let a: Record<string, unknown>;
  try { a = JSON.parse(rawArgs || "{}"); } catch { return { error: "arguments must be JSON" }; }
  if (name === "search_units") {
    const district = str(a.district)?.toLowerCase(); const use = USES.find((x) => x === a.use);
    const minDesks = Number.isInteger(a.min_desks) ? (a.min_desks as number) : null;
    const maxRent = Number.isInteger(a.max_rent_egp) ? (a.max_rent_egp as number) : null;
    const track = ["daily", "monthly", "long_term"].find((x) => x === a.track);
    const matches = (await listUnits()).filter((u) =>
      (!district || `${u.district} ${u.title_en}`.toLowerCase().includes(district)) &&
      // Units not yet assessed by the rubric stay eligible for plain office/meeting searches only.
      (!use || passingUses(u).some((x) => x.use === use) || (!Array.isArray(u.specs.uses) && (use === "office" || use === "meeting"))) &&
      (!minDesks || (deskCap(u) ?? 0) >= minDesks) && (!maxRent || u.rent_egp <= maxRent));
    const onTrack = (u: Unit) => !track || u.rent_periods.includes(track as Unit["rent_periods"][number]);
    const units = matches.filter(onTrack);
    // Units that match everything but the rental track, so the agent can explain (e.g. long-term only).
    const otherTrack = matches.filter((u) => !onTrack(u)).slice(0, 3).map((u) => ({ slug: u.slug, district: u.district, kind: u.kind, tracks: u.rent_periods, rent_egp_month: u.rent_egp }));
    return { count: units.length, units: units.slice(0, 5).map(brief), ...(otherTrack.length ? { matching_other_tracks: otherTrack } : {}) };
  }
  if (name === "get_unit") {
    const u = str(a.slug) ? await getUnit(a.slug as string) : null;
    if (!u) return { error: "unit not found" };
    return { ...brief(u), summary_en: u.summary_en, summary_ar: u.summary_ar, highlights_en: u.highlights_en,
      specs: { area_m2: u.specs.area_m2_estimate, rooms: u.specs.rooms_count, bathrooms: u.specs.bathrooms_count, natural_light: u.specs.natural_light, condition: u.specs.condition },
      use_reasons: passingUses(u).map((x) => ({ use: x.use, verdict: x.verdict, why: x.reasons_en.join(" ") })),
      next_free_days: u.rent_periods.includes("daily") ? await freeDays(u.slug, 10) : "long-term/monthly: starts from available_from" };
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
        renter_name: String(a.renter_name ?? ""), renter_phone: String(a.renter_phone ?? "").replace(/\D/g, ""),
        addons: Array.isArray(a.addons) ? (a.addons as { item_id: string; qty: number }[]).slice(0, 10) : [],
      });
      ctx.bookingId = b.id; ctx.total = b.total_egp;
      return { booking_ref: b.id.slice(0, 8), status: b.status, total_egp: b.total_egp, hold_minutes: 30 };
    } catch (e) { return { error: (e as Error).message }; }
  }
  return { error: `unknown tool ${name}` };
}

function systemPrompt(): string {
  const today = todayCairo();
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "long" }).format(new Date());
  const addons = JSON.stringify(ADDON_CATALOG.map((x) => ({ id: x.id, en: x.name_en, ar: x.name_ar, egp: x.price_egp })));
  return AGENT_PROMPT_V2.replace("{TODAY}", today).replace("{WEEKDAY}", weekday).replace("{TOMORROW}", tomorrow).replace("{ADDONS}", addons);
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

export async function chatTurn(sessionId: string, message: string): Promise<{ reply: string; booking_id?: string; total_egp?: number }> {
  const history = (await loadHistory(sessionId)).slice(-10);
  const msgs: Msg[] = [{ role: "system", content: systemPrompt() }, ...history, { role: "user", content: message }];
  const ctx: { bookingId?: string; total?: number } = {};
  const trace: unknown[] = [];
  let reply = "";
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const r = (await meta.product.chat({
      messages: msgs, temperature: 0.3, reasoning_effort: "low",
      ...(round < MAX_ROUNDS ? { tools: TOOLS, tool_choice: "auto" } : {}), // last round: force a text answer
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
  return { reply, ...(ctx.bookingId ? { booking_id: ctx.bookingId, total_egp: ctx.total } : {}) };
}
