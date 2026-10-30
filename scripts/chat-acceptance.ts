// Segment acceptance: 10 scripted Egyptian-Arabic/English booking conversations
// against the real agent (muse-spark-1.3, owner-approved run). Synthetic renters
// only. Writes transcripts to .scratch/chat-transcripts.md, cleans up after.
// Run: pnpm chat-acceptance
import { writeFileSync } from "node:fs";
import { chatTurn } from "../lib/agent/agent";
import { createBooking } from "../lib/booking";
import { freeDays } from "../lib/db/store";
import { pool } from "../lib/db/pg";

type Check = (r: { replies: string[]; bookingIds: string[] }) => boolean;
const arabic = (s: string) => /[؀-ۿ]/.test(s);
const S = (turns: string[], name: string, check: Check, setup?: () => Promise<string[]>) => ({ name, turns, check, setup });

async function main() {
  const chatby = await freeDays("gen-alex-chatby", 5);
  const smouha = await freeDays("gen-alex-smouha", 3);
  const downtown = await freeDays("gen-downtown", 3);
  const takenDay = chatby[1];
  const scenarios = [
    S(["عايز مكتب في الزمالك ليوم بكرة لـ 3 أشخاص", "تمام، أول واحد", "اسمي سامي تجربة ورقمي 01000000001", "أيوه أكد الحجز من غير إضافات"], "1 Zamalek day booking, happy path (AR)", (r) => r.bookingIds.length === 1),
    S(["عايز مكان ينفع عيادة أسنان في القاهرة، إيه المتاح؟"], "2 dental clinic search uses the rubric", (r) => /nasr|new cairo|heliopolis|zayed|مدينة نصر|التجمع|القاهرة الجديدة|مصر الجديدة|زايد|empty/i.test(r.replies.join(" "))),
    S(["عايز أحجز المكتب اللي في مدينة نصر ليوم واحد بكرة"], "3 bare unit asked for a day -> long-term only", (r) => /طويل|شهر|long|تشطيب|يومي/i.test(r.replies[0])),
    S(["Hi, I need a meeting or training room in Maadi or New Cairo for one day next week. What do you have?"], "4 English mirror", (r) => !arabic(r.replies[0])),
    S(["عايز مكتب في أسوان"], "5 no results -> says so, offers alternatives", (r) => /مفيش|مش متاح|ملقتش|لا يوجد|مش لاقي|حالياً/i.test(r.replies[0])),
    S([`عايز أحجز مكتب الشاطبي في إسكندرية يوم ${takenDay}`], "6 slot taken -> offers other days", (r) => r.replies[0].includes(chatby[0]) || r.replies[0].includes(chatby[2]) || /محجوز|مش فاضي|taken|booked/i.test(r.replies[0]),
      async () => [(await createBooking({ unit_slug: "gen-alex-chatby", date: takenDay, track: "daily", renter_name: "Acceptance Blocker", renter_phone: "01000000009" })).id]),
    S([`عايز مكتب في سموحة في إسكندرية يوم ${smouha[0]} ومعاه 2 كابتشينو`, "اسمي منى تجربة 01000000002", "تمام أكد"], "7 add-ons itemised in the booking", (r) => r.bookingIds.length === 1),
    S([`عايز أحجز مكتب في وسط البلد يوم ${downtown[0]}`, "اسمي كريم تجربة ورقمي 0123"], "8 bad phone -> asks again", (r) => /رقم|موبايل|01|phone/i.test(r.replies[1])),
    S([`عايز مكتب في إسكندرية يوم ${chatby[2]}`, `معلش خليها يوم ${chatby[3]} بدل كده، وخلينا في الشاطبي`, "اسمي هالة تجربة 01000000003", "من غير إضافات، أكد الحجز"], "9 changed date -> books the new date", (r) => r.bookingIds.length === 1),
    S(["اكتبلي قصيدة عن البحر"], "10 off-topic -> brief refusal, back to booking", (r) => /مكتب|حجز|office|booking/i.test(r.replies[0])),
  ];
  const md: string[] = ["# Chat acceptance transcripts (synthetic renters)", `Run ${new Date().toISOString()} on muse-spark-1.3`, ""];
  const created: string[] = []; const sessions: string[] = []; const results: string[] = [];
  const only = process.argv[2]?.split(",").map(Number);
  for (const [i, sc] of scenarios.entries()) {
    if (only && !only.includes(i + 1)) continue;
    const extra = sc.setup ? await sc.setup() : [];
    created.push(...extra);
    const session = `acceptance-${Date.now()}-${i}`; sessions.push(session);
    const replies: string[] = []; const bookingIds: string[] = [];
    md.push(`## ${sc.name}`);
    for (const t of sc.turns) {
      const out = await chatTurn(session, t);
      replies.push(out.reply);
      if (out.booking_id) { bookingIds.push(out.booking_id); created.push(out.booking_id); }
      md.push(`- **Renter:** ${t}`, `- **Agent:** ${out.reply.replace(/\n+/g, " ")}${out.booking_id ? `  _(booking ${out.booking_id.slice(0, 8)}, EGP ${out.total_egp})_` : ""}`);
    }
    const ok = sc.check({ replies, bookingIds });
    results.push(`${ok ? "PASS" : "FAIL"}  ${sc.name}`); md.push(`**Result:** ${ok ? "PASS" : "FAIL"}`, "");
    console.log(results.at(-1));
  }
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
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
