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

export const EMPTY_PROMPT_V1 = `Remove ALL furniture and movable objects (desks, chairs, monitors, keyboards, drawers, bins, cables, papers) from this office photo. Keep walls, windows, doors, floor, ceiling and light direction EXACTLY as they are — same camera angle, same geometry, photorealistic empty room. If the room is already empty, return it unchanged.`;

export const STYLE_PROMPTS_V1: Record<"startup" | "clinic" | "training", string> = {
  startup: `Fit out this office as a modern startup office that physically fits the room: desks with monitors sized to the floor area, ergonomic mesh chairs, one small plant per desk, warm light. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
  clinic: `Fit out this office as a clean medical clinic consult room that physically fits the room: white exam desk, waiting chairs along one wall, medical cabinet, soft clinical light. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
  training: `Fit out this office as a training room that physically fits the room: rows of simple tables facing one wall, stackable chairs, a whiteboard on the wall. Keep walls, windows, doors, floor, ceiling and camera angle EXACTLY unchanged. Photorealistic.`,
};
