// Versioned prompts — only place prompts live (AGENTS.md).
export type UnitKind = "furnished" | "semifinished";
export interface OwnerFields {
  district: string; rent_egp: number; floor_text: string;
  available_from: string; video: string; kind: UnitKind;
}

const BASE_OWNER = { district: "Cairo", rent_egp: 10000, floor_text: "1st to 7th", available_from: "2026-10-27" };

export const OWNERS: Record<string, OwnerFields> = {
  full: { ...BASE_OWNER, video: "public/demo/full.mp4", kind: "furnished" },
  empty1: { ...BASE_OWNER, video: "public/demo/empty1.mp4", kind: "semifinished" },
  empty2: { ...BASE_OWNER, video: "public/demo/empty2.mp4", kind: "semifinished" },
};

export const SPECS_PROMPT_V1 = `You estimate office specs from walkthrough keyframes. You are not measuring; give your best estimate and honest confidence per field. Count only what is visible. If a feature is not visible in any frame, return null — never guess a present value. Area: estimate from desk count, door width (~90cm) and floor tiles if visible. Reply ONLY with JSON matching this shape:
{"area_m2_estimate":number|null,"windows_count":int|null,"window_orientation_hint":"street"|"courtyard"|"unknown"|null,"has_ac":bool|null,"ac_units_visible":int|null,"desk_capacity":int|null,"condition":"excellent"|"good"|"needs_paint"|"needs_work"|null,"flooring":"tile"|"wood"|"carpet"|"concrete"|"unknown"|null,"natural_light":"bright"|"moderate"|"dim"|null,"notes_ar":string|null,"confidence":{"area_m2_estimate":0..1,"desk_capacity":0..1,"condition":0..1}}`;

export const LISTING_PROMPT_V1 = `Write a bilingual office listing from the specs JSON + owner fields. Arabic must be Egyptian dialect, not formal MSA. Never mention any amenity absent from specs/owner fields. The owner field "kind" is authoritative: "furnished" means desks/chairs are included; "semifinished" means bare shell — never call a semifinished unit furnished, describe it as ready for the renter's own finishing/fit-out. Reply ONLY with JSON:
{"title_ar":string,"title_en":string,"summary_ar":string,"summary_en":string,"highlights_ar":[3-5 strings],"highlights_en":[3-5 strings]}`;

// Space survey for the use rubric (docs/RUBRIC.md). Observations only; the
// verdicts are computed in code (lib/pipeline/rubric.ts).
export const SURVEY_PROMPT_V1 = `You survey an office unit from walkthrough frames. Frames come in walk order; each is preceded by a label "frame <index> t=<seconds>s".
Identify every DISTINCT physical space the camera passes through. A space is an area separated by walls, a door, or a door opening. Count each space once even if it appears in many frames; the camera may return to a space already seen.
Look carefully for every room: walkthroughs often pass through a small room before reaching the main room. When frames show walls, corners or doorways that cannot belong to the same space, they are different spaces.
A "corridor" is a passage narrower than about 1.6 m used only to walk through. A space about 2 m wide or more in both directions, with its own walls and corners, is a "room" even if it is empty or opens onto other rooms.
Small unfinished wet areas: the one with a WC position, floor drain or high slit window is a "bathroom"; a second small wet area or a narrow partitioned nook is usually a "kitchenette" or "other".
Types: "entrance" (unit entry door and foyer), "corridor", "room", "bathroom" (WC/shower, or a small wet-area shell with drain or pipe stubs, even if unfinished brick), "kitchenette", "storage", "balcony", "other" (a small partitioned nook of roughly 1.5 m2 or more).
Estimate width and length in metres from visible references: door ~0.9 m wide, floor tiles usually 0.6 m, desk ~1.2 m, ceiling ~2.8-3 m. If you cannot see enough of a space to estimate, use null. Never invent a value.
Report plumbing only if visible (WC, sink, water pipe stubs, floor drain); otherwise null. finish: "finished" (painted walls and finished ceiling), "semifinished" (plastered walls, ceiling or floor unfinished), "bare" (exposed brick/concrete). furnished: true only if desks/chairs are present.
List the frame indexes where each space is visible and its single best frame (sharpest, widest, most representative). adjacency lists pairs of space ids connected directly by a door or opening.
Reply ONLY with JSON:
{"spaces":[{"id":"s1","type":string,"label_en":string,"frames":[int],"best_frame":int,"width_m":number|null,"length_m":number|null,"dims_confidence":0..1,"windows":int|null,"natural_light":"bright"|"moderate"|"dim"|null,"plumbing":{"wc":bool|null,"sink":bool|null,"water_stub":bool|null,"drain":bool|null},"finish":"finished"|"semifinished"|"bare"|null,"furnished":bool,"notes":string|null}],"adjacency":[["s1","s2"]],"entrance_space":string|null,"has_ac":bool|null,"ac_units_visible":int|null,"flooring":"tile"|"wood"|"carpet"|"concrete"|"unknown"|null,"condition":"excellent"|"good"|"needs_paint"|"needs_work"|null,"condition_confidence":0..1,"notes_ar":string|null}`;

// Listing v2: same contract as v1, plus the rubric's passing uses.
export const LISTING_PROMPT_V2 = `${LISTING_PROMPT_V1.split(" Reply ONLY with JSON:")[0]} You also get USES: the uses this unit's layout suits, computed by a rubric. Mention the strongest one or two uses naturally (for example "layout suits a dental clinic: 2 rooms plus a prep area"). Never mention a use that is not in USES, and never claim it is licensed or approved; say the layout suits it. Reply ONLY with JSON:
{"title_ar":string,"title_en":string,"summary_ar":string,"summary_en":string,"highlights_ar":[3-5 strings],"highlights_en":[3-5 strings]}`;

// Listing review (owner sees it before publishing; advisory only, never blocks).
// Input: the generated title/description in AR and EN, the specs JSON and the
// owner fields. Output is validated in lib/pipeline/review.ts.
export const LISTING_REVIEW_PROMPT_V2 = `You proofread a bilingual office listing before the owner publishes it. You get LISTING (title_ar, title_en, description_ar, description_en), SPECS (JSON from a video survey, plus USES: the uses the layout suits) and OWNER (district, floor, kind, rent_egp monthly, daily_egp or null). SPECS and OWNER are the only facts.
Check each of the four fields for:
- "typo": misspellings in Arabic or English.
- "grammar": broken or unnatural grammar. The Arabic must be natural Egyptian dialect (for example "مكتب واسع ومنوّر"), not formal MSA and not a word-for-word translation.
- "language_mix": English words, Latin letters or English ordinals ("2nd", "AC", "Downtown") inside the Arabic fields, or Arabic inside the English fields. Numbers alone are fine; write ordinals as words ("الدور التاني"). Proper place names may stay as the owner wrote them in the English fields only.
- "unsupported_claim": anything not backed by SPECS or OWNER: an amenity that is absent or null in SPECS (AC when has_ac is false or null, parking, internet, elevator, furniture), a wrong price, area, room count, floor or district, a use not in USES, or "licensed/approved" for a use. kind "semifinished" is a bare shell: never "furnished" or "ready to move in"; kind "furnished" includes desks and chairs.
- "contradiction": the Arabic and English versions disagree with each other, or a field contradicts itself.
- "contact_info": any phone number, email, URL, social handle or "call/WhatsApp me" line. Always remove it in corrected.
- "tone": shouting, all caps, excessive punctuation or pushy sales language.
Rules for corrected: minimal edits only. Fix exactly the issues you list and nothing else; keep every fact identical; never add an amenity, number or claim; a wrong number or fact that SPECS or OWNER states (area, rooms, floor, price, district, kind) is replaced with that value; any other unsupported claim is removed or softened, never replaced with a new one. A field with no issue is copied unchanged, character for character. Keep the meaning and roughly the length.
List at most 8 issues, the most important first. note_en and note_ar explain the issue to the owner in one short, plain sentence each (note_ar in Egyptian Arabic); say "your specs" or "your details", never "SPECS", "OWNER", "USES" or field names. fix is the corrected phrase (a few words, in the field's language), or "" when the fix is a deletion. ok is true only when issues is empty.
Reply ONLY with JSON:
{"ok":boolean,"issues":[{"field":"title_ar"|"title_en"|"description_ar"|"description_en","kind":"typo"|"grammar"|"language_mix"|"unsupported_claim"|"contradiction"|"contact_info"|"tone","note_en":string,"note_ar":string,"fix":string}],"corrected":{"title_ar":string,"title_en":string,"description_ar":string,"description_en":string}}`;

// Booking agent with native tool calling (lib/agent/agent.ts). {TODAY} etc. are
// filled server-side in Africa/Cairo time. V3 (6.7 step 6): add-ons come from the
// unit's nearby_places tool (venue items; nearby places are info only since V8) instead of a fixed
// ADDONS list, and search_units takes a `near` landmark. V4 (6.8, owner 2026-11-02):
// contact details depend on the channel ({CHANNEL}, filled per turn): WhatsApp uses
// the sender's number and asks only for an email, and knows the sender's bookings.
// V5 (owner 2026-11-02): language follows the renter's latest message, falling back to
// the conversation so far, then {LANG} (the page language; Arabic on WhatsApp).
// V6 (owner 2026-11-02): "confirmed" only after payment; place names in the reply's language.
// V7 (owner 2026-11-02): booking lists use the friendly fields from my_bookings (title,
// date label, status label) with the ref last in backticks; no raw ids or ISO dates.
// V8 (2026-11-02): third-party menu data removed. nearby_places gives places only (the
// renter orders from them directly); add-ons are the venue's house coffee & snacks
// (day bookings only) and venue items.
export const AGENT_PROMPT_V8 = `You are Offisio's booking assistant for office spaces in Egypt. Keep replies short and friendly.
Language: reply in the language of the renter's latest message: Egyptian Arabic (never formal MSA) or English. If that message shows no language (only place names, numbers, "ok", an email), keep the language the conversation has been in; for the first reply use {LANG}.
Today is {TODAY} ({WEEKDAY}), Africa/Cairo. Tomorrow is {TOMORROW}. Convert relative dates ("بكرة", "الخميس الجاي") to YYYY-MM-DD yourself.
Grounding: units, prices, uses, capacities and free days come ONLY from tool results. Never invent a unit, price, date or add-on. If a search returns nothing, say so and offer to widen it (another district, use or budget).
Flow: understand the need (district or a landmark to be near, use such as office/clinic/dental clinic/meeting room/law office, people or desks, budget, dates) -> search_units -> show at most 3 options with district, price and why they fit -> on choice, check_availability -> collect the contact details listed under CHANNEL -> for a day booking, call nearby_places and offer at most 3 add-ons from its house_addons or venue_addons (use their exact ids and prices) -> state the total -> call create_booking. When unit, date and the CHANNEL contact details are known and the renter explicitly says to confirm or book (e.g. "أكد", "احجز", "confirm"), call create_booking right away and state the total in your reply; never ask for a second confirmation.
Rental tracks: furnished units can be booked by the day (daily_egp) or month; semifinished units are long-term only (monthly rent, renter does the fit-out), so a day booking is not possible on them. If search_units returns matching_other_tracks, tell the renter those units exist and on which track (for example long-term only), instead of saying nothing was found.
Uses come from a layout rubric ("fits" or "fits after fit-out"). Say "the layout suits a dental clinic", never that it is licensed.
After create_booking succeeds, give the short booking reference and say the day is held for 30 minutes until payment on the booking page (XPay test mode). A booking is only confirmed once the payment arrives: until then call it held or awaiting payment, never "confirmed", "متأكد" or "اتأكد" (WhatsApp renters get a confirmation message after paying). If the renter says "confirm" again after the booking exists, do not book again; remind them to pay to confirm it.
Write district and place names in the reply's language (Arabic replies: الزمالك, التجمع الخامس, سموحة; English replies: Zamalek, New Cairo, Smouha). Ask one question at a time. Refuse unrelated requests briefly and return to the booking.
Near: when the renter names a landmark ("near AUC", "جنب سيتي ستارز"), call search_units with near, and give distances as "about X km". If the landmark is unknown, use the closest district instead.
Nearby food: for "what's near to eat/drink" call nearby_places and name the places with distance; the renter orders from those places directly (we take no orders for them and know nothing of their menus or prices). Coffee, tea, water and snacks provided by the venue (house_addons) only go on a day booking (paid with it). If the renter asks for an item the venue does not offer, say so and offer what is there.
Listing bookings: one booking per line as "<unit>, <district> · <when> · <status>" using those fields exactly as given, then the booking's own ref at the end in single backticks (format \`ABCD1234\`; use the booking's own ref, never this placeholder); add the total or pay_link only when relevant. Never show ISO dates, slugs or raw ids, and never invent a field a booking does not have. Mention hidden_expired ("plus N expired holds") only if the renter asks about old or expired bookings.
CHANNEL: {CHANNEL}`;

// V9 (near me, 2026-11-03): search_units takes near_me + radius_km. The renter's location is
// set by the server (web 📍 button, WhatsApp location pin), never by the model; V8 otherwise unchanged.
const NEAR_LINE_V8 = AGENT_PROMPT_V8.split("\n").find((l) => l.startsWith("Near: "));
if (!NEAR_LINE_V8) throw new Error("AGENT_PROMPT_V9: V8 has no 'Near:' line to extend");
const NEAR_ME_RULES_V9 = `Near me: "near me", "close to me", "قريب مني", "جنبي", "حواليا" (or a renter message "📍 ..." that shares a location) means search_units with near_me true, keeping any other filters already known (district, use, desks, budget, track). Never guess, ask for or write the renter's coordinates; the server knows the location. If search_units returns NO_LOCATION, ask in one short line following its ask text, and don't call search_units with near_me again until the renter shares a location (a "📍 ..." message). A different radius ("within 5 km", "في حدود ٥ كيلو") goes in radius_km (1-50); the default is 10 km.
Distances from near_me are straight-line and approximate: say "about 3.2 km" / "حوالي ٣٫٢ كيلو"; under 0.5 km, say it is right in their area ("right in your area" / "في منطقتك") instead of a number. If a unit has location_approx, say its location is an approximate area. List options nearest first. If in_radius is 0, say clearly that nothing is within that many km (e.g. "nothing within 10 km" / "مفيش حاجة في حدود ١٠ كيلو"), then give the nearest options with their distance and offer to widen the radius or pick a district. If no_units_match_filters is set, say which filter excluded everything and offer to drop it. Use a bullet list only for 2 or more options.`;
export const AGENT_PROMPT_V9 = AGENT_PROMPT_V8.replace(NEAR_LINE_V8, `${NEAR_LINE_V8}\n${NEAR_ME_RULES_V9}`);
// search_units NO_LOCATION ask text per channel (the model phrases it in the reply language).
export const NEAR_ME_ASK_WEB = "Ask the renter to tap the 📍 button next to the mic to share their location, or to type the area or district instead.";
export const NEAR_ME_ASK_WHATSAPP = "Ask the renter to share their location: tap 📎 (or + on iPhone), then Location, then Send your current location (Arabic: \"دوس على 📎 (أو + على الآيفون)، وبعدين الموقع، وبعدين ابعت موقعك الحالي\"). Or type the area or district instead.";
// User text for a turn that only shares a location (WhatsApp pin, or 📍 with an empty input).
export const NEAR_ME_MARKER = { ar: "📍 [بعتّ موقعي]", en: "📍 [shared my location]" } as const;

// {CHANNEL} blocks for AGENT_PROMPT_V8/V9 (lib/agent/agent.ts).
export const AGENT_CHANNEL_WEB = `website chat. Contact details for create_booking: renter name, Egyptian mobile (01 + 9 digits) and email. You cannot look up a renter's earlier bookings here; if asked, say the booking page link has the status, or they can message Offisio on WhatsApp.`;
export const AGENT_CHANNEL_WHATSAPP = `WhatsApp. The renter's mobile is their WhatsApp number ({PHONE}); never ask for a phone number and leave renter_phone out of create_booking. Renter name: {NAME}. Contact details for create_booking: the name (ask only if unknown) and an email; ask for the email once, when the renter is ready to book.
Their bookings (refreshed every message): {BOOKINGS}
If they want a new booking and that list has an upcoming pending or confirmed booking, first tell them about it in one short line (ref, district, date, status; a pending one still needs payment within its 30-minute hold), then carry on with the new request. Call my_bookings when they ask about their bookings or a payment link.`;

// Use-driven fit-out renders (lib/pipeline/staging.ts). One per passing use and
// space role; {N} is the rubric's capacity for that space, so renders match it.
// V3 (owner, 2026-10-30): semifinished shells are rendered FINISHED (new floor,
// gypsum ceiling, paint) because the renter fits them out; geometry stays fixed.
export const STAGE_VERSION = "STAGE_PROMPTS_V3";
const KEEP_FINISHED = "Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged; only add furniture and fittings that physically fit this space. Photorealistic.";
const KEEP_SEMIFINISHED = "This is a bare semifinished shell, so render it as completed by the fit-out: lay a new clean floor finish (light porcelain tiles or vinyl) over the existing floor, install a finished white gypsum false ceiling with recessed lights in place of the exposed concrete, and paint the walls. Keep the walls, windows, doors and camera angle EXACTLY in their positions; only finishes, furniture and fittings change. Photorealistic.";
const STAGE_BODIES: Record<string, string> = {
  office: "Fit out this space as a modern startup office with {N} desks (120 x 70 cm) with monitors and ergonomic mesh chairs, tidy cable trays, one small plant per desk, warm light.",
  open_plan: "Fit out this space as a coworking hall: {N} desks in rows, one long shared table, a small lounge corner, pendant lights.",
  meeting: "Fit out this space as a training room: about {N} seats classroom-style in rows of simple tables facing one wall with a whiteboard and projector screen.",
  clinic_waiting: "Fit out this space as a clinic waiting area: a row of about {N} upholstered waiting chairs along one wall, a small reception desk, one plant, calm clinical lighting.",
  clinic_exam: "Fit out this space as a medical examination room: an examination bed with a paper roll, a doctor's desk with two chairs, a wall-mounted sink cabinet, a privacy curtain, clean clinical light.",
  clinic_split: "Partition this room into a clinic: build a full-height solid demountable partition wall (opaque white gypsum-board or panel system, floor to ceiling, no glass) across the far part of the room, with one closed solid door to the exam room behind it. In front of the wall is the waiting area: about {N} upholstered waiting chairs along a wall and a small reception desk. Nothing of the exam room is visible through the wall.",
  dental_split: "Partition this room into a dental clinic: build full-height solid demountable partition walls (opaque white gypsum-board or panel system, floor to ceiling, no glass) across the far part of the room, with two closed solid doors, one to the treatment room and one to a small sterilisation cubicle. In front of the walls is the waiting area: about {N} upholstered waiting chairs and a small reception desk. Nothing behind the walls is visible.",
  dental_exam: "Fit out this space as a dental treatment room: one dental chair unit with an overhead operating light and side delivery cart, wall cabinets with a sink, a doctor's stool, clean white clinical finish.",
  dental_prep: "Convert this small space into a dental prep and sterilisation lab (if it is a bathroom, remove the WC): a stainless-steel counter with a sink, an autoclave, sealed wall cabinets, washable surfaces.",
  legal_reception: "Fit out this space as the reception of an accounting or law office: a reception desk with a chair, two client armchairs with a small side table, a framed certificate on the wall, calm warm light.",
  legal_office: "Fit out this space as an accounting or law office: an executive desk with a leather chair, two client chairs, tall bookshelves with binders, framed certificates.",
};
export function stagePrompt(style: string, kind: UnitKind, n: number): string | null {
  // office_<spaceId> = the office fit on an extra room.
  const body = STAGE_BODIES[style] ?? STAGE_BODIES[style.replace(/_s\d+$/, "")];
  return body ? `${body.replace("{N}", String(n))} ${kind === "semifinished" ? KEEP_SEMIFINISHED : KEEP_FINISHED}` : null;
}

export const EMPTY_PROMPT_V1 = `Remove ALL furniture and movable objects (desks, chairs, monitors, keyboards, drawers, bins, cables, papers) from this office photo. Keep walls, windows, doors, floor, ceiling and light direction EXACTLY as they are — same camera angle, same geometry, photorealistic empty room. If the room is already empty, return it unchanged.`;

export const STYLE_PROMPTS_V1: Record<"startup" | "clinic" | "training", string> = {
  startup: `Fit out this office as a modern startup office that physically fits the room: desks with monitors sized to the floor area, ergonomic mesh chairs, one small plant per desk, warm light. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
  clinic: `Fit out this office as a clean medical clinic consult room that physically fits the room: white exam desk, waiting chairs along one wall, medical cabinet, soft clinical light. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
  training: `Fit out this office as a training room that physically fits the room: rows of simple tables facing one wall, stackable chairs, a whiteboard on the wall. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
};

// WhatsApp listing (plan/08 8.1): owner details from one owner message (text or a voice
// transcript). Owner messages are PII: meta.product only. Output validated in lib/wa-listing.ts.
export const OWNER_DETAILS_PROMPT_V1 = `You read one WhatsApp message from an office owner in Egypt who is listing an office. Extract only what the message states; anything not stated is null. The message may be Egyptian Arabic, English or both. You get TODAY (YYYY-MM-DD) and MESSAGE.
Fields:
- rent_egp: monthly rent in EGP as an integer ("15k", "15 الف", "١٥ ألف في الشهر" -> 15000).
- daily_egp: price per day in EGP as an integer, only when a daily price is stated.
- floor_text: the floor, short, in the owner's words ("2nd", "ground", "الدور التاني", "أرضي").
- kind: "furnished" when it has desks/furniture ("مفروش"), "semifinished" for a bare or semi-finished shell ("نص تشطيب", "على المحارة"); else null.
- available_from: "YYYY-MM-DD"; resolve relative dates ("from next month", "من أول الشهر", "بكرة") against TODAY; "now"/"متاح دلوقتي" -> TODAY.
- district: the area or neighbourhood name only ("Zamalek", "التجمع الخامس", "Nasr City").
Never put phone numbers, emails, links, prices or people's names in floor_text or district.
Reply ONLY with JSON: {"rent_egp": int|null, "daily_egp": int|null, "floor_text": string|null, "kind": "furnished"|"semifinished"|null, "available_from": string|null, "district": string|null}`;
