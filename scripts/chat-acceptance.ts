// Segment acceptance: 18 scripted Egyptian-Arabic/English booking conversations (11-13 and 17 on the WhatsApp channel; 14-18 near me)
// against the real agent (muse-spark-1.3, owner-approved run). Synthetic renters
// only. Writes transcripts to .scratch/chat-transcripts.md, cleans up after.
// Run: pnpm chat-acceptance            (all)   pnpm chat-acceptance 14,15,16,17,18   (only those)
import { writeFileSync } from "node:fs";
import { chatTurn, type Sender } from "../lib/agent/agent";
import { createBooking } from "../lib/booking";
import { freeDays, getUnit, listUnits } from "../lib/db/store";
import { haversineM } from "../lib/places";
import { dateLabel } from "../lib/booking-labels";
import { pool } from "../lib/db/pg";
import { renterLocation } from "../lib/geo";

// trace: this session's tool calls ({ tool, args, ok }) as stored in chat_sessions.tool_calls.
type Trace = { tool: string; args: string; ok: boolean }[];
// cards: per turn, the slugs of the unit cards under the reply (in the tool's result order).
type Check = (r: { replies: string[]; bookingIds: string[]; trace: Trace; cards: string[][] }) => boolean | Promise<boolean>;
// "2.3 km", "٢٫٣ كيلو", or the whole number ("حوالي ٢ كيلو").
const AR_DIGITS = (s: string) => s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const saysDistance = (text: string, km?: number) => km !== undefined && [String(km), String(Math.round(km))]
  .flatMap((s) => [s, AR_DIGITS(s), AR_DIGITS(s).replace(".", "٫")])
  .some((s) => new RegExp(`(^|[^\\d٠-٩.٫])${s.replace(".", "\\.")}\\s*(km|كم|كيلو)`, "i").test(text));
const arabic = (s: string) => /[؀-ۿ]/.test(s);
// Nothing is paid in these runs, so no reply may call a booking confirmed (V6 wording rule).
const saysConfirmed = (r: { replies: string[] }) => r.replies.some((x) => /(حجزك|الحجز)\s*(متأكد|اتأكد)|booking is confirmed|you're confirmed/i.test(x));
// A turn may carry a near-me location, injected like the routes do (renterLocation, then chatTurn).
type Turn = string | { text: string; location: unknown };
const S = (turns: Turn[], name: string, check: Check, setup?: () => Promise<string[]>, sender?: Sender, lang: "ar" | "en" = "ar") => ({ name, turns, check, setup, sender, lang });
const serverLoc = (raw: unknown) => { const v = renterLocation(raw); if (!v.ok) throw new Error(v.code); return v.loc; };
const nearMeCalls = (t: Trace) => t.filter((c) => c.tool === "search_units" && /"near_me"\s*:\s*true/.test(c.args));
const saysKm = (s: string) => /\d[\d.,٫]*\s*(km|كم|كيلو)|[٠-٩][٠-٩٫,]*\s*(كم|كيلو)/i.test(s);
// WhatsApp scenarios (6.8): a synthetic Egyptian sender; the phone comes from wa_id.
const WA: Sender = { waId: "201000000012", name: "Wael Test" };
// V7 shows dates as weekday labels ("Sun 8 Nov", "الأحد ٨ نوفمبر"), never ISO. Accept the
// full label, the label without the weekday (the model may drop it), or the ISO day.
const mentionsDay = (text: string, d: string) =>
  [dateLabel(d, "ar"), dateLabel(d, "en")].some((l) => text.includes(l) || text.includes(l.split(" ").slice(1).join(" "))) || text.includes(d);

async function main() {
  const chatby = await freeDays("gen-alex-chatby", 5);
  const smouha = await freeDays("gen-alex-smouha", 3);
  const downtown = await freeDays("gen-downtown", 3);
  const takenDay = chatby[1];
  const zamalek = await freeDays("gen-zamalek", 6);
  const zUnit = await getUnit("gen-zamalek");
  const zTitles = [zUnit?.title_ar, zUnit?.title_en].filter((t): t is string => !!t);
  const mentionsZamalek = (text: string) => zTitles.some((t) => text.includes(t)) || /الزمالك|zamalek/i.test(text);
  if (!zUnit?.location) throw new Error("gen-zamalek has no location; run pnpm backfill-locations");
  const zLoc = { lat: zUnit.location.lat, lng: zUnit.location.lng };
  // Expected near-me order from the Zamalek point, computed from the DB (not from the agent).
  const zPoint = serverLoc(zLoc);
  const nearZ = (await listUnits()).filter((u) => u.location).map((u) => ({ slug: u.slug, m: haversineM(zPoint, u.location!) }))
    .sort((a, b) => a.m - b.m).map((u) => ({ slug: u.slug, km: Math.round(u.m / 100) / 10 }));
  const WA2: Sender = { waId: "201000000013", name: "Nour Test" }; // no bookings: near-me only
  // A paid booking for the WhatsApp sender on a day still free at setup time (earlier
  // scenarios book days too). Status set directly; payment is not under test here.
  const waDates: string[] = [];
  const confirmedFor = async (s: Sender, slug: string) => {
    const date = (await freeDays(slug, 1))[0];
    waDates.push(date);
    const b = await createBooking({ unit_slug: slug, date, track: "daily", renter_name: s.name ?? "WA Test", renter_email: "wa.test@example.com", wa_id: s.waId, created_via: "whatsapp" });
    await pool().query("update bookings set status = 'confirmed' where id = $1", [b.id]);
    return b.id;
  };
  const scenarios = [
    S(["عايز مكتب في الزمالك ليوم بكرة لـ 3 أشخاص", "تمام، أول واحد", "اسمي سامي تجربة ورقمي 01000000001 والإيميل sami.test@example.com", "أيوه أكد الحجز من غير إضافات"], "1 Zamalek day booking, happy path (AR)", (r) => r.bookingIds.length === 1 && !saysConfirmed(r)),
    S(["عايز مكان ينفع عيادة أسنان في القاهرة، إيه المتاح؟"], "2 dental clinic search uses the rubric", (r) => /nasr|new cairo|heliopolis|zayed|مدينة نصر|التجمع|القاهرة الجديدة|مصر الجديدة|زايد|empty/i.test(r.replies.join(" "))),
    S(["عايز أحجز المكتب اللي في مدينة نصر ليوم واحد بكرة"], "3 bare unit asked for a day -> long-term only", (r) => /طويل|شهر|long|تشطيب|يومي/i.test(r.replies[0])),
    S(["Hi, I need a meeting or training room in Maadi or New Cairo for one day next week. What do you have?"], "4 English mirror", (r) => !arabic(r.replies[0])),
    S(["عايز مكتب في أسوان"], "5 no results -> says so, offers alternatives", (r) => /مفيش|مش متاح|ملقتش|لا يوجد|مش لاقي|حالياً/i.test(r.replies[0])),
    S([`عايز أحجز مكتب الشاطبي في إسكندرية يوم ${takenDay}`], "6 slot taken -> offers other days", (r) => r.replies[0].includes(chatby[0]) || r.replies[0].includes(chatby[2]) || /محجوز|مش فاضي|taken|booked/i.test(r.replies[0]),
      async () => [(await createBooking({ unit_slug: "gen-alex-chatby", date: takenDay, track: "daily", renter_name: "Acceptance Blocker", renter_phone: "01000000009", renter_email: "blocker.test@example.com" })).id]),
    S([`عايز مكتب في سموحة في إسكندرية يوم ${smouha[0]} ومعاه 2 قهوة من المكان`, "اسمي منى تجربة 01000000002 و mona.test@example.com", "تمام أكد"], "7 house add-on itemised in the booking",
      async (r) => r.bookingIds.length === 1 && (await pool().query("select 1 from booking_addons where booking_id = $1 and item_id = 'house-coffee'", [r.bookingIds[0]])).rowCount === 1),
    S([`عايز أحجز مكتب في وسط البلد يوم ${downtown[0]}`, "اسمي كريم تجربة ورقمي 0123"], "8 bad phone -> asks again", (r) => /رقم|موبايل|01|phone/i.test(r.replies[1])),
    S([`عايز مكتب في إسكندرية يوم ${chatby[2]}`, `معلش خليها يوم ${chatby[3]} بدل كده، وخلينا في الشاطبي`, "اسمي هالة تجربة 01000000003 والإيميل hala.test@example.com", "من غير إضافات، أكد الحجز"], "9 changed date -> books the new date", (r) => r.bookingIds.length === 1),
    S(["اكتبلي قصيدة عن البحر"], "10 off-topic -> brief refusal, back to booking", (r) => /مكتب|حجز|office|booking/i.test(r.replies[0])),
    S([`عايز مكتب في الزمالك يوم ${zamalek[3]}`, "تمام احجزه، الإيميل wael.test@example.com", "أكد"], "11 WhatsApp booking: email only, phone from the sender",
      (r) => r.bookingIds.length === 1 && !saysConfirmed(r) && !/رقم (الموبايل|تليفونك|موبايلك)|phone number/i.test(r.replies.join(" ")), undefined, WA),
    S([`عايز أحجز مكتب في سموحة يوم ${smouha[1]}`], "12 WhatsApp: existing confirmed booking mentioned first",
      (r) => waDates.some((d) => mentionsDay(r.replies[0], d)) || mentionsZamalek(r.replies[0]) || /عندك حجز|حجز مؤكد|already have|existing booking/i.test(r.replies[0]),
      async () => [await confirmedFor(WA, "gen-zamalek")], WA),
    S(["إيه الحجوزات اللي عندي؟"], "13 WhatsApp: my_bookings lists the sender's booking",
      (r) => waDates.some((d) => mentionsDay(r.replies[0], d)) || mentionsZamalek(r.replies[0]),
      async () => [await confirmedFor(WA, "gen-zamalek")], WA),
    // Near me (14-18). The Zamalek point is the demo unit's own stored location; Aswan is far from every unit.
    S([{ text: "عايز مكتب قريب مني", location: zLoc }], "14 near me (web, AR): in-radius results nearest first, with distances",
      // Result order: the reply's cards follow the tool's distance order; the first is the nearest unit
      // (computed here independently) and the second unit's distance appears in the reply.
      (r) => nearMeCalls(r.trace).some((c) => c.ok) && r.cards[0]?.[0] === nearZ[0]?.slug
        && (!r.cards[0]?.[1] || r.cards[0][1] === nearZ[1]?.slug) && saysDistance(r.replies[0], nearZ[1]?.km)),
    S(["عايز مكتب قريب مني"], "15 near me without a location: asks for 📍 once, no near-me result",
      (r) => /📍|موقعك|location/i.test(r.replies[0]) && !nearMeCalls(r.trace).some((c) => c.ok)),
    S([{ text: "عايز مكتب قريب مني", location: { lat: 24.09, lng: 32.9 } }], "16 near me far away (Aswan): nothing within 10 km, nearest options",
      (r) => /(مفيش|ملقتش|مش لاقي|لا يوجد).{0,40}(10|١٠)|nothing within 10|no offices? within 10/i.test(r.replies[0]) && saysKm(r.replies[0])),
    S([{ text: "", location: zLoc }, "عايز مكتب بكرة"], "17 WhatsApp pin then 'tomorrow': near results for tomorrow",
      (r) => nearMeCalls(r.trace).some((c) => c.ok) && (mentionsZamalek(r.replies[1]) || /وسط البلد|downtown/i.test(r.replies[1]))
        && !/📎|شارك.{0,10}موقع|share your location/i.test(r.replies[1]), undefined, WA2),
    S([{ text: "Any offices within 5 km of me?", location: zLoc }], "18 'within 5 km' in English",
      (r) => !arabic(r.replies[0]) && nearMeCalls(r.trace).some((c) => /"radius_km"\s*:\s*5\b/.test(c.args)) && saysKm(r.replies[0]), undefined, undefined, "en"),
  ];
  const md: string[] = ["# Chat acceptance transcripts (synthetic renters)", `Run ${new Date().toISOString()} on muse-spark-1.3`, ""];
  const created: string[] = []; const sessions: string[] = []; const results: string[] = [];
  const only = process.argv[2]?.split(",").map(Number);
  try {
  for (const [i, sc] of scenarios.entries()) {
    if (only && !only.includes(i + 1)) continue;
    const extra = sc.setup ? await sc.setup() : [];
    created.push(...extra);
    const session = `acceptance-${Date.now()}-${i}`; sessions.push(session);
    const replies: string[] = []; const bookingIds: string[] = []; const cards: string[][] = [];
    md.push(`## ${sc.name}`);
    for (const turn of sc.turns) {
      const t = typeof turn === "string" ? turn : turn.text;
      const loc = typeof turn === "string" ? undefined : serverLoc(turn.location);
      const out = await chatTurn(session, t, sc.sender ? "whatsapp" : "chat", sc.sender, sc.lang, loc);
      replies.push(out.reply); cards.push(out.units.map((u) => u.slug));
      if (out.booking_id) { bookingIds.push(out.booking_id); created.push(out.booking_id); }
      // Coordinates are never written to the transcript.
      md.push(`- **Renter:** ${loc ? "📍 (location) " : ""}${t}`, `- **Agent:** ${out.reply.replace(/\n+/g, " ")}${out.booking_id ? `  _(booking ${out.booking_id.slice(0, 8)}, EGP ${out.total_egp})_` : ""}`);
    }
    const tr = await pool().query<{ t: Trace }>("select tool_calls t from chat_sessions where session_key = $1", [session]);
    const ok = await sc.check({ replies, bookingIds, trace: tr.rows[0]?.t ?? [], cards });
    results.push(`${ok ? "PASS" : "FAIL"}  ${sc.name}`); md.push(`**Result:** ${ok ? "PASS" : "FAIL"}`, "");
    console.log(results.at(-1));
  }
  } catch (e) {
    results.push(`FAIL  crashed: ${(e as Error).message}`); console.log(results.at(-1));
  } finally {
  const trace = await pool().query<{ n: number }>("select coalesce(sum(jsonb_array_length(tool_calls)),0)::int n from chat_sessions where session_key = any($1)", [sessions]);
  md.push(`Tool calls across all scenarios: ${trace.rows[0].n}`);
  writeFileSync(".scratch/chat-transcripts.md", md.join("\n"));
  // Cleanup: bookings (free their days), sessions.
  const held = await pool().query<{ a: string[] }>("select availability_ids a from bookings where id = any($1::uuid[])", [created]);
  await pool().query("update availability set is_booked = false where id = any($1::uuid[])", [held.rows.flatMap((r) => r.a)]);
  await pool().query("delete from booking_addons where booking_id = any($1::uuid[])", [created]);
  await pool().query("delete from payments where booking_id = any($1::uuid[])", [created]);
  await pool().query("delete from bookings where id = any($1::uuid[])", [created]);
  await pool().query("delete from chat_sessions where session_key = any($1)", [sessions]);
  console.log(`${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed; tool calls ${trace.rows[0].n}; cleaned ${created.length} bookings, ${sessions.length} sessions`);
  await pool().end();
  }
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
