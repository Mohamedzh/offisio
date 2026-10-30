// Use rubric RUBRIC_V1 (docs/RUBRIC.md stage 2): deterministic verdicts on a
// validated survey. Thresholds are planning heuristics, not licensing rules.
import type { Space, Survey } from "./survey";
import type { UnitKind } from "../meta/prompts";

export const RUBRIC_VERSION = "RUBRIC_V1";
export const USES = ["office", "open_plan", "meeting", "clinic", "dental", "legal"] as const;
export type Use = (typeof USES)[number];
export type Verdict = "fits" | "fits_after_fitout" | "not_suitable";
export type Role = "room" | "exam" | "waiting" | "prep" | "bathroom" | "reception" | "office";
export interface UseVerdict {
  use: Use; verdict: Verdict;
  reasons_en: string[]; reasons_ar: string[];
  roles: Partial<Record<Role, string>>; // space ids, used by staging
  capacity?: { desks_comfortable?: number; desks_max?: number; seats_classroom?: number; seats_theatre?: number };
}

export const T = {
  officeMinM2: 6, openPlanMinM2: 25, meetingMinM2: 15,
  examMinM2: 9, waitingMinM2: 6, prepMinM2: 2, clinicSplitM2: 16, dentalSplitM2: 18,
  legalOfficeMinM2: 7, legalSplitM2: 14,
  deskComfortM2: 4.0, deskMaxM2: 3.0, deskMinW: 1.4, deskMinD: 1.9,
  seatClassroomM2: 1.9, seatTheatreM2: 1.0,
};

export const area = (s: Space): number | null => (s.width_m && s.length_m ? Math.round(s.width_m * s.length_m * 10) / 10 : null);
// A "corridor" at least 2 m in both directions is really a room (survey guard).
const usable = (s: Space) => s.type === "room" || s.type === "other" ||
  (s.type === "corridor" && s.width_m !== null && s.length_m !== null && Math.min(s.width_m, s.length_m) >= 2);
const isBath = (s: Space) => s.type === "bathroom" || s.plumbing.wc === true;
const m2 = (n: number) => `${n} m²`;
const ar2 = (n: number) => `${n} م²`;

// Desks per room: area heuristic (docs/RUBRIC.md), only if a desk + chair zone fits the room's shape.
export function deskCapacity(rooms: Space[]): { comfortable: number; max: number } {
  let comfortable = 0, max = 0;
  for (const r of rooms) {
    const a = area(r); if (!a || !r.width_m || !r.length_m) continue;
    if (Math.min(r.width_m, r.length_m) < T.deskMinW || Math.max(r.width_m, r.length_m) < T.deskMinD) continue;
    comfortable += Math.max(1, Math.floor(a / T.deskComfortM2));
    max += Math.max(1, Math.floor(a / T.deskMaxM2));
  }
  return { comfortable, max };
}

export function assess(survey: Survey, kind: UnitKind): UseVerdict[] {
  const rooms = survey.spaces.filter(usable).sort((a, b) => (area(b) ?? 0) - (area(a) ?? 0));
  const largest = rooms[0] ? area(rooms[0]) ?? 0 : 0;
  const baths = survey.spaces.filter(isBath);
  const entrance = survey.spaces.find((s) => s.type === "entrance" && (area(s) ?? 0) >= T.waitingMinM2);
  const lightOrAc = survey.has_ac === true || survey.spaces.some((s) => (s.windows ?? 0) > 0);
  const fitout = kind === "semifinished";
  const out: UseVerdict[] = [];
  const v = (use: Use, verdict: Verdict, en: string[], ar: string[], roles: UseVerdict["roles"] = {}, capacity?: UseVerdict["capacity"]) =>
    out.push({ use, verdict, reasons_en: en, reasons_ar: ar, roles, ...(capacity ? { capacity } : {}) });

  // Office
  const desks = deskCapacity(rooms);
  const officeRoom = rooms.find((r) => (area(r) ?? 0) >= T.officeMinM2);
  if (!officeRoom) v("office", "not_suitable", [`No room of at least ${m2(T.officeMinM2)} was seen.`], [`مفيش أوضة مساحتها ${ar2(T.officeMinM2)} على الأقل.`]);
  else if (!lightOrAc && !fitout) v("office", "not_suitable", ["No window or AC was seen."], ["مفيش شباك ولا تكييف ظاهر."]);
  else v("office", lightOrAc ? "fits" : "fits_after_fitout",
    [`${rooms.length} usable room(s); about ${desks.comfortable} desks comfortably (up to ${desks.max}) at 120 × 70 cm.`, ...(lightOrAc ? [] : ["Needs AC or ventilation added in the fit-out."])],
    [`${rooms.length} أوضة تنفع؛ حوالي ${desks.comfortable} مكتب براحة (لحد ${desks.max}) بمقاس 120 × 70 سم.`, ...(lightOrAc ? [] : ["محتاج تكييف أو تهوية في التشطيب."])],
    { room: officeRoom.id }, { desks_comfortable: desks.comfortable, desks_max: desks.max });

  // Open-plan / coworking
  if (largest >= T.openPlanMinM2) v("open_plan", "fits", [`Largest room is about ${m2(largest)}.`], [`أكبر أوضة حوالي ${ar2(largest)}.`], { room: rooms[0].id }, { desks_comfortable: Math.floor(largest / T.deskComfortM2), desks_max: Math.floor(largest / T.deskMaxM2) });
  else v("open_plan", "not_suitable", [`Largest room is about ${m2(largest)}; open-plan needs ${m2(T.openPlanMinM2)}.`], [`أكبر أوضة حوالي ${ar2(largest)}؛ المساحة المفتوحة محتاجة ${ar2(T.openPlanMinM2)}.`]);

  // Meeting / training
  if (largest >= T.meetingMinM2) v("meeting", "fits", [`A ${m2(largest)} room seats about ${Math.floor(largest / T.seatClassroomM2)} classroom-style.`], [`أوضة ${ar2(largest)} تاخد حوالي ${Math.floor(largest / T.seatClassroomM2)} كرسي بنظام الفصل.`], { room: rooms[0].id }, { seats_classroom: Math.floor(largest / T.seatClassroomM2), seats_theatre: Math.floor(largest / T.seatTheatreM2) });
  else v("meeting", "not_suitable", [`Largest room is about ${m2(largest)}; a training room needs ${m2(T.meetingMinM2)}.`], [`أكبر أوضة حوالي ${ar2(largest)}؛ قاعة التدريب محتاجة ${ar2(T.meetingMinM2)}.`]);

  // General clinic: exam + separate waiting + bathroom
  const exam = rooms.find((r) => (area(r) ?? 0) >= T.examMinM2);
  const waitingRoom = rooms.find((r) => r !== exam && (area(r) ?? 0) >= T.waitingMinM2);
  const waiting = waitingRoom ?? entrance;
  const bath = baths[0];
  let clinic: Verdict = "not_suitable";
  const clinicRoles: UseVerdict["roles"] = {};
  if (bath && exam && waiting) { clinic = "fits"; Object.assign(clinicRoles, { exam: exam.id, waiting: waiting.id, bathroom: bath.id }); }
  else if (bath && fitout && largest >= T.clinicSplitM2) { clinic = "fits_after_fitout"; Object.assign(clinicRoles, { exam: rooms[0].id, waiting: rooms[0].id, bathroom: bath.id }); }
  const clinicWhy = (): [string[], string[]] => {
    const en: string[] = [], ar: string[] = [];
    if (!bath) { en.push("No bathroom was seen."); ar.push("مفيش حمام ظاهر."); }
    if (!exam) { en.push(`No exam room of at least ${m2(T.examMinM2)}.`); ar.push(`مفيش أوضة كشف ${ar2(T.examMinM2)} على الأقل.`); }
    else if (!waiting) { en.push("Only one room: a clinic needs a waiting room separate from the exam room."); ar.push("أوضة واحدة بس: العيادة محتاجة أوضة انتظار منفصلة عن أوضة الكشف."); }
    return [en, ar];
  };
  if (clinic === "fits") v("clinic", "fits", ["Separate exam room, waiting area and bathroom."], ["أوضة كشف وانتظار منفصلين وحمام."], clinicRoles);
  else if (clinic === "fits_after_fitout") v("clinic", clinic, [`One ${m2(largest)} room could be partitioned into exam + waiting; bathroom present.`], [`أوضة ${ar2(largest)} ممكن تتقسم كشف وانتظار؛ والحمام موجود.`], clinicRoles);
  else { const [en, ar] = clinicWhy(); v("clinic", "not_suitable", en, ar); }

  // Dental: clinic + a separate prep/sterilisation area (not the one kept bathroom)
  const used = new Set(Object.values(clinicRoles));
  const prep = survey.spaces.find((s) => !used.has(s.id) && s.type !== "corridor" && s.type !== "entrance" && s.type !== "balcony" &&
    (isBath(s) ? baths.length > 1 : true) && ((area(s) ?? T.prepMinM2) >= T.prepMinM2));
  // Fit-out route: partition the prep area from a clinic room with spare area.
  const spare = clinic === "fits" && ((exam && (area(exam) ?? 0) >= T.examMinM2 + T.prepMinM2) ||
    (waitingRoom && (area(waitingRoom) ?? 0) >= T.waitingMinM2 + T.prepMinM2));
  if (clinic === "fits" && prep) v("dental", "fits", ["Clinic layout plus a separate area for the prep/sterilisation lab."], ["تخطيط عيادة ومعاه مكان منفصل لمعمل التحضير والتعقيم."], { ...clinicRoles, prep: prep.id });
  else if (clinic !== "not_suitable" && fitout && (prep || spare || largest >= T.dentalSplitM2))
    v("dental", "fits_after_fitout", ["A prep/sterilisation area can be partitioned in the fit-out."], ["ممكن يتعمل معمل تحضير وتعقيم بقاطع في التشطيب."], { ...clinicRoles, ...(prep ? { prep: prep.id } : {}) });
  else if (clinic === "not_suitable") { const [en, ar] = clinicWhy(); v("dental", "not_suitable", en, ar); }
  else v("dental", "not_suitable", ["No separate space for the prep/sterilisation lab."], ["مفيش مكان منفصل لمعمل التحضير والتعقيم."]);

  // Accounting / law office: reception + >= 1 private office
  const office = rooms.find((r) => (area(r) ?? 0) >= T.legalOfficeMinM2);
  const reception = rooms.find((r) => r !== office && (area(r) ?? 0) >= T.waitingMinM2) ?? entrance;
  if (office && reception) v("legal", "fits", ["A reception/waiting area plus a private office."], ["استقبال وانتظار ومعاهم مكتب خاص."], { office: office.id, reception: reception.id });
  else if (fitout && largest >= T.legalSplitM2) v("legal", "fits_after_fitout", [`One ${m2(largest)} room could be split into reception + office.`], [`أوضة ${ar2(largest)} ممكن تتقسم استقبال ومكتب.`], { office: rooms[0].id, reception: rooms[0].id });
  else v("legal", "not_suitable", ["Needs a reception area separate from a private office."], ["محتاج استقبال منفصل عن المكتب الخاص."]);
  return out;
}

// Legacy specs fields (unit page, agent) derived from the survey.
export function deriveSpecs(survey: Survey, uses: UseVerdict[]) {
  const rooms = survey.spaces.filter(usable);
  const areas = rooms.map(area).filter((a): a is number => a !== null);
  const office = uses.find((u) => u.use === "office");
  const lights = survey.spaces.map((s) => s.natural_light).filter(Boolean);
  const dimsConf = rooms.length ? rooms.reduce((s, r) => s + r.dims_confidence, 0) / rooms.length : 0;
  return {
    area_m2_estimate: areas.length ? Math.round(areas.reduce((a, b) => a + b, 0)) : null,
    windows_count: survey.spaces.reduce((s, x) => s + (x.windows ?? 0), 0),
    window_orientation_hint: null,
    has_ac: survey.has_ac, ac_units_visible: survey.ac_units_visible,
    desk_capacity: office?.capacity?.desks_comfortable ?? null,
    condition: survey.condition, flooring: survey.flooring,
    natural_light: lights.includes("bright") ? "bright" : lights.includes("moderate") ? "moderate" : lights[0] ?? null,
    notes_ar: survey.notes_ar,
    rooms_count: rooms.length, bathrooms_count: survey.spaces.filter(isBath).length,
    confidence: { area_m2_estimate: Math.round(dimsConf * 100) / 100, desk_capacity: Math.round(dimsConf * 100) / 100, condition: survey.condition_confidence },
    rubric_version: RUBRIC_VERSION,
  };
}
