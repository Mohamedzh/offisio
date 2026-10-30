// Fit-out renders grouped per use for the viewer (owner, 2026-10-30): a clinic
// is shown as its waiting + exam rooms together, never one room alone, and a
// dental clinic adds the prep lab. A group shows only if its anchor exists.
export type FitPart = "waiting" | "exam" | "prep" | "partitioned";
interface Part { style: string; part?: FitPart; anchor?: boolean }
export interface FitGroup { key: string; label: string; items: { style: string; part?: FitPart; url: string }[] }

const GROUPS: { key: string; label: string; split?: string; parts: Part[] }[] = [
  { key: "office", label: "viewer.style.office", parts: [{ style: "office", anchor: true }] },
  { key: "open_plan", label: "viewer.style.open_plan", parts: [{ style: "open_plan", anchor: true }] },
  { key: "meeting", label: "viewer.style.meeting", parts: [{ style: "meeting", anchor: true }] },
  { key: "clinic", label: "viewer.group.clinic", split: "clinic_split",
    parts: [{ style: "clinic_waiting", part: "waiting" }, { style: "clinic_exam", part: "exam", anchor: true }] },
  { key: "dental", label: "viewer.group.dental", split: "dental_split",
    parts: [{ style: "clinic_waiting", part: "waiting" }, { style: "dental_exam", part: "exam", anchor: true }, { style: "dental_prep", part: "prep" }] },
  { key: "legal", label: "viewer.style.legal_office", parts: [{ style: "legal_office", anchor: true }] },
  // Legacy v1 renders (units not yet re-modelled).
  { key: "startup", label: "viewer.style.startup", parts: [{ style: "startup", anchor: true }] },
  { key: "clinic_v1", label: "viewer.style.clinic", parts: [{ style: "clinic", anchor: true }] },
  { key: "training", label: "viewer.style.training", parts: [{ style: "training", anchor: true }] },
];

export function fitGroups(staged: { style: string; url: string }[]): FitGroup[] {
  const url = (style: string) => staged.find((s) => s.style === style)?.url;
  const out: FitGroup[] = [];
  for (const g of GROUPS) {
    const split = g.split && url(g.split);
    if (split) { out.push({ key: g.key, label: g.label, items: [{ style: g.split!, part: "partitioned", url: split }] }); continue; }
    if (!g.parts.some((p) => p.anchor && url(p.style))) continue;
    out.push({ key: g.key, label: g.label, items: g.parts.filter((p) => url(p.style)).map((p) => ({ style: p.style, part: p.part, url: url(p.style)! })) });
  }
  return out;
}
