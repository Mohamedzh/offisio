// Booking agent: Egyptian-Arabic chat -> structured action (validated JSON).
// Chat text is PII -> meta.product only, never contributor (AGENTS.md).
import { meta } from "../meta/client";
import { pool } from "../db/pg";
import { listUnits, freeDates } from "../db/store";
import { createBooking } from "../booking";
import { ADDON_CATALOG } from "../addons/catalog";

const SYSTEM = `You are Offisio's booking assistant. Reply in Egyptian Arabic by default; mirror English if the renter writes English. Short and friendly, never formal MSA.
You NEVER invent units, prices, slots or add-ons — only use the DATA given below.
Flow: understand need -> present at most 3 matching units -> on choice, check the day is free -> collect renter name + Egyptian mobile (01xxxxxxxxx) -> offer add-ons (coffee etc.) -> confirm total back -> only then set action=create_booking.
Reply ONLY with JSON:
{"reply": string, "action": "none"|"create_booking", "booking": {"unit_slug": string, "date": "YYYY-MM-DD", "renter_name": string, "renter_phone": string, "addons": [{"item_id": string, "qty": int}]} | null}
Set action=create_booking ONLY when unit, date, name, phone are all known and the renter confirmed. Today is 2026-10-27 (Africa/Cairo). Daily track is for furnished units (800 EGP/day); bare units are long-term only — say so and offer the furnished daily unit instead if they want a day.`;

interface AgentAction { reply: string; action: string; booking: { unit_slug: string; date: string; renter_name: string; renter_phone: string; addons?: { item_id: string; qty: number }[] } | null }

async function loadHistory(sessionKey: string): Promise<{ role: string; content: string }[]> {
  const { rows } = await pool().query<{ messages: { role: string; content: string }[] }>("select messages from chat_sessions where session_key = $1", [sessionKey]);
  return rows[0]?.messages ?? [];
}
async function saveHistory(sessionKey: string, messages: { role: string; content: string }[]) {
  await pool().query(
    `insert into chat_sessions (session_key, messages) values ($1, $2)
     on conflict (session_key) do update set messages = excluded.messages, updated_at = now()`,
    [sessionKey, JSON.stringify(messages.slice(-20))]);
}

export async function chatTurn(sessionId: string, message: string): Promise<{ reply: string; booking_id?: string; total_egp?: number }> {
  const history = (await loadHistory(sessionId)).slice(-10);
  const units = (await listUnits()).map((u) => ({ slug: u.slug, title_en: u.title_en, kind: u.kind, district: u.district, rent_egp: u.rent_egp, daily_egp: u.daily_egp, tracks: u.rent_periods, specs: u.specs }));
  const dates = await freeDates();
  const data = `DATA units=${JSON.stringify(units)}\nDATA free_days=${JSON.stringify(dates)}\nDATA addons=${JSON.stringify(ADDON_CATALOG.map((a) => ({ id: a.id, en: a.name_en, ar: a.name_ar, egp: a.price_egp })))}`;
  const r = (await meta.product.chat({ messages: [{ role: "system", content: SYSTEM + "\n" + data }, ...history, { role: "user", content: message }], temperature: 0.3 })) as { choices: { message: { content: string } }[] };
  let parsed: AgentAction;
  try { parsed = JSON.parse(r.choices[0].message.content.replace(/^```json\s*|\s*```$/g, "").trim()); }
  catch { parsed = { reply: "معلش، حصلت مشكلة صغيرة. ممكن تعيد اللي كنت بتقوله؟", action: "none", booking: null }; }
  await saveHistory(sessionId, [...history, { role: "user", content: message }, { role: "assistant", content: parsed.reply }]);
  if (parsed.action === "create_booking" && parsed.booking) {
    try {
      const b = await createBooking({ unit_slug: parsed.booking.unit_slug, date: parsed.booking.date, renter_name: parsed.booking.renter_name, renter_phone: parsed.booking.renter_phone, addons: parsed.booking.addons });
      return { reply: parsed.reply, booking_id: b.id, total_egp: b.total_egp };
    } catch (e) {
      return { reply: `${parsed.reply}\n(booking note: ${(e as Error).message} — please check the date/phone and try again)` };
    }
  }
  return { reply: parsed.reply };
}
