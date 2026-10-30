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

// Booking agent with native tool calling (lib/agent/agent.ts). {TODAY} etc. are
// filled server-side in Africa/Cairo time.
export const AGENT_PROMPT_V2 = `You are Offisio's booking assistant for office spaces in Egypt. Reply in Egyptian Arabic by default (short, friendly, never formal MSA); if the renter writes English, reply in English.
Today is {TODAY} ({WEEKDAY}), Africa/Cairo. Tomorrow is {TOMORROW}. Convert relative dates ("بكرة", "الخميس الجاي") to YYYY-MM-DD yourself.
Grounding: units, prices, uses, capacities and free days come ONLY from tool results. Never invent a unit, price, date or add-on. If a search returns nothing, say so and offer to widen it (another district, use or budget).
Flow: understand the need (district, use such as office/clinic/dental clinic/meeting room/law office, people or desks, budget, dates) -> search_units -> show at most 3 options with district, price and why they fit -> on choice, check_availability -> collect renter name and Egyptian mobile (01 + 9 digits) -> offer add-ons from the ADDONS list -> confirm the total back -> only after the renter confirms, call create_booking.
Rental tracks: furnished units can be booked by the day (daily_egp) or month; semifinished units are long-term only (monthly rent, renter does the fit-out), so a day booking is not possible on them. If search_units returns matching_other_tracks, tell the renter those units exist and on which track (for example long-term only), instead of saying nothing was found.
Uses come from a layout rubric ("fits" or "fits after fit-out"). Say "the layout suits a dental clinic", never that it is licensed.
After create_booking succeeds, give the short booking reference and say payment completes on the booking page (XPay test mode). Ask one question at a time. Refuse unrelated requests briefly and return to the booking.
ADDONS: {ADDONS}`;

// Use-driven fit-out renders (lib/pipeline/staging.ts). One per passing use and
// space role; {N} is the rubric's capacity for that space, so renders match it.
const KEEP = "Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged; only add furniture and fittings that physically fit this space. Photorealistic.";
export const STAGE_PROMPTS_V2: Record<string, string> = {
  office: `Fit out this space as a modern startup office with {N} desks (120 x 70 cm) with monitors and ergonomic mesh chairs, tidy cable trays, one small plant per desk, warm light. ${KEEP}`,
  open_plan: `Fit out this space as a coworking hall: {N} desks in rows, one long shared table, a small lounge corner, pendant lights. ${KEEP}`,
  meeting: `Fit out this space as a training room: about {N} seats classroom-style in rows of simple tables facing one wall with a whiteboard and projector screen. ${KEEP}`,
  clinic_waiting: `Fit out this space as a clinic waiting area: a row of about {N} upholstered waiting chairs along one wall, a small reception desk, one plant, calm clinical lighting. ${KEEP}`,
  clinic_exam: `Fit out this space as a medical examination room: an examination bed with a paper roll, a doctor's desk with two chairs, a wall-mounted sink cabinet, a privacy curtain, clean clinical light. ${KEEP}`,
  clinic_split: `Partition this room with a light glass-and-gypsum wall into a small clinic waiting area (waiting chairs, reception desk) and an examination area (exam bed, doctor's desk, sink cabinet). Keep the existing walls, windows, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
  dental_exam: `Fit out this space as a dental treatment room: one dental chair unit with an overhead operating light and side delivery cart, wall cabinets with a sink, a doctor's stool, clean white clinical finish. ${KEEP}`,
  dental_prep: `Fit out this small space as a dental prep and sterilisation lab: a stainless-steel counter with a sink, an autoclave, sealed wall cabinets, washable surfaces. ${KEEP}`,
  legal_office: `Fit out this space as an accounting or law office: an executive desk with a leather chair, two client chairs, tall bookshelves with binders, framed certificates. ${KEEP}`,
};

export const EMPTY_PROMPT_V1 = `Remove ALL furniture and movable objects (desks, chairs, monitors, keyboards, drawers, bins, cables, papers) from this office photo. Keep walls, windows, doors, floor, ceiling and light direction EXACTLY as they are — same camera angle, same geometry, photorealistic empty room. If the room is already empty, return it unchanged.`;

export const STYLE_PROMPTS_V1: Record<"startup" | "clinic" | "training", string> = {
  startup: `Fit out this office as a modern startup office that physically fits the room: desks with monitors sized to the floor area, ergonomic mesh chairs, one small plant per desk, warm light. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
  clinic: `Fit out this office as a clean medical clinic consult room that physically fits the room: white exam desk, waiting chairs along one wall, medical cabinet, soft clinical light. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
  training: `Fit out this office as a training room that physically fits the room: rows of simple tables facing one wall, stackable chairs, a whiteboard on the wall. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
};
