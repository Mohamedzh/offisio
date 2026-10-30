// RUBRIC_V1 fixture checks (no model calls). Run: pnpm check-rubric
import { assess, type Use, type Verdict } from "../lib/pipeline/rubric";
import type { Space, Survey } from "../lib/pipeline/survey";

const sp = (id: string, type: Space["type"], w: number | null, l: number | null, extra: Partial<Space> = {}): Space => ({
  id, type, label_en: type, frames: [0], best_frame: 0, width_m: w, length_m: l, dims_confidence: 0.6, windows: 0,
  natural_light: null, plumbing: { wc: null, sink: null, water_stub: null, drain: null }, finish: null, furnished: false, notes: null, ...extra,
});
const survey = (spaces: Space[], has_ac: boolean | null = null): Survey => ({
  spaces, adjacency: [], entrance_space: null, has_ac, ac_units_visible: null, flooring: null, condition: null, condition_confidence: 0.5, notes_ar: null,
});

let fails = 0;
function expect(name: string, s: Survey, kind: "furnished" | "semifinished", want: Partial<Record<Use, Verdict>>, desks?: [number, number]) {
  const got = Object.fromEntries(assess(s, kind).map((u) => [u.use, u]));
  const bad = Object.entries(want).filter(([u, v]) => got[u].verdict !== v).map(([u, v]) => `${u}: want ${v} got ${got[u].verdict}`);
  if (desks) { const c = got.office.capacity; if (c?.desks_comfortable !== desks[0] || c?.desks_max !== desks[1]) bad.push(`desks: want ${desks} got ${c?.desks_comfortable},${c?.desks_max}`); }
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${name}${bad.length ? "  " + bad.join("; ") : ""}`);
  if (bad.length) fails++;
}

// `full`: one furnished ~3.7 x 3.8 room (~14 m2), window -> office ~3 desks, no clinic.
expect("1-room 14 m2 furnished office", survey([sp("s1", "entrance", 1, 1.5), sp("s2", "room", 3.7, 3.8, { windows: 1, furnished: true })]), "furnished",
  { office: "fits", clinic: "not_suitable", dental: "not_suitable", meeting: "not_suitable", open_plan: "not_suitable", legal: "not_suitable" }, [3, 4]);
// `empty1`/`empty2` shape: 2 rooms + bathroom + small nook, semifinished.
expect("2 rooms + bath + nook (dental case)", survey([sp("e", "entrance", 1.2, 4), sp("b", "bathroom", 1.5, 2), sp("r1", "room", 3.5, 4.5, { windows: 3 }), sp("r2", "room", 2.8, 3), sp("n", "other", 1.2, 1.8)]), "semifinished",
  { office: "fits", clinic: "fits", dental: "fits", meeting: "fits", legal: "fits" });
expect("nook without dims still counts as prep", survey([sp("b", "bathroom", 1.5, 2), sp("r1", "room", 3.5, 4.5, { windows: 1 }), sp("r2", "room", 2.8, 3), sp("n", "kitchenette", null, null)]), "furnished",
  { clinic: "fits", dental: "fits" });
expect("2 rooms + bath, no extra space, furnished -> bathroom retrofit", survey([sp("b", "bathroom", 1.5, 2), sp("r1", "room", 3.5, 4), sp("r2", "room", 2.5, 3)]), "furnished",
  { clinic: "fits", dental: "fits_after_fitout" });
expect("only bathroom can be retrofitted as prep", survey([sp("b", "bathroom", 1.5, 2), sp("r1", "room", 3, 3.5), sp("r2", "room", 2.5, 3)]), "furnished",
  { dental: "fits_after_fitout" });
expect("second bathroom can be prep", survey([sp("b", "bathroom", 1.5, 2), sp("b2", "bathroom", 1.2, 1.8), sp("r1", "room", 3, 3.5), sp("r2", "room", 2.5, 3)]), "furnished",
  { clinic: "fits", dental: "fits" });
expect("1 big semifinished room + bath -> fit-out clinic", survey([sp("b", "bathroom", 1.5, 2), sp("r1", "room", 4, 5, { windows: 2 })]), "semifinished",
  { clinic: "fits_after_fitout", dental: "fits_after_fitout", legal: "fits_after_fitout", meeting: "fits" });
expect("no bathroom -> no clinic", survey([sp("r1", "room", 4, 5, { windows: 2 }), sp("r2", "room", 3, 3)]), "semifinished",
  { clinic: "not_suitable", dental: "not_suitable", legal: "fits" });
expect("no window and no AC, furnished -> office not suitable", survey([sp("r1", "room", 3, 3)], false), "furnished", { office: "not_suitable" });
expect("big open hall", survey([sp("r1", "room", 6, 8, { windows: 4 })], true), "furnished", { open_plan: "fits", meeting: "fits", office: "fits" }, [12, 16]);
expect("narrow 1.2 m nook gives no desk", survey([sp("r1", "room", 3, 3, { windows: 1 }), sp("n", "other", 1.2, 2)]), "furnished", { office: "fits" }, [2, 3]);

// `empty2` shape: 2 rooms + bathroom, no nook seen, semifinished -> prep partitioned from the 11 m2 room.
expect("semifinished clinic with spare room area -> dental after fit-out", survey([sp("b", "bathroom", 1.6, 2), sp("r1", "room", 3.2, 3.5), sp("r2", "room", 3.2, 3.8, { windows: 2 })]), "semifinished",
  { clinic: "fits", dental: "fits_after_fitout" });
expect("furnished clinic, no prep space -> bathroom retrofit", survey([sp("b", "bathroom", 1.6, 2), sp("r1", "room", 3.2, 3.5), sp("r2", "room", 3.2, 3.8, { windows: 2 })]), "furnished",
  { clinic: "fits", dental: "fits_after_fitout" });
console.log(fails ? `${fails} FAILED` : "all rubric checks passed");
process.exit(fails ? 1 : 0);
