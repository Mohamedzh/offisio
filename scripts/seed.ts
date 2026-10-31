// Seed the 3 demo units (specs/listing from the video pipeline), media,
// and rolling 10:00-17:00 hourly availability (today through AVAILABILITY_UNTIL). Run after migrate: pnpm seed
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../lib/db/pg";
import { generateAvailability } from "../lib/db/store";

interface Listing { title_ar: string; title_en: string; summary_ar: string; summary_en: string; highlights_ar: string[]; highlights_en: string[] }
const UNITS = [
  { slug: "full", kind: "furnished", periods: ["daily", "monthly"], daily: 800, district: "New Administrative Capital (Pioneer Plaza)", rent: 14500, floor: "2nd" },
  { slug: "empty1", kind: "semifinished", periods: ["long_term"], daily: null, district: "Nasr City, Cairo", rent: 8500, floor: "Ground" },
  { slug: "empty2", kind: "semifinished", periods: ["long_term"], daily: null, district: "New Cairo", rent: 11000, floor: "5th" },
] as const;

async function main() {
  const p = pool();
  // Blob URLs from `pnpm upload-demo` (data/seed/blob-urls.json).
  let blobUrls: Record<string, Record<string, string>>;
  try {
    blobUrls = JSON.parse(readFileSync(join("data/seed", "blob-urls.json"), "utf8")) as Record<string, Record<string, string>>;
  } catch {
    throw new Error("data/seed/blob-urls.json missing: run `pnpm upload-demo` first (needs BLOB_READ_WRITE_TOKEN)");
  }
  const blob = (slug: string, file: string): string => {
    const url = blobUrls[slug]?.[file];
    if (!url) throw new Error(`blob-urls.json missing ${slug}/${file}: re-run pnpm upload-demo`);
    return url;
  };
  for (const u of UNITS) {
    const specs = (JSON.parse(readFileSync(join("data/seed", `${u.slug}-specs.json`), "utf8")) as { specs: Record<string, unknown> }).specs;
    const l = JSON.parse(readFileSync(join("data/seed", `${u.slug}-listing.json`), "utf8")) as Listing;
    const ins = await p.query<{ id: string }>(
      `insert into units (slug, kind, district, rent_egp, daily_egp, floor_text, available_from, rent_periods, title_ar, title_en, summary_ar, summary_en, highlights_ar, highlights_en)
       values ($1,$2,$3,$4,$5,$6,'2026-10-27',$7,$8,$9,$10,$11,$12,$13)
       on conflict (slug) do update set district = excluded.district, rent_egp = excluded.rent_egp, floor_text = excluded.floor_text,
         title_ar = excluded.title_ar, title_en = excluded.title_en, summary_ar = excluded.summary_ar, summary_en = excluded.summary_en,
         highlights_ar = excluded.highlights_ar, highlights_en = excluded.highlights_en, rent_periods = excluded.rent_periods, daily_egp = excluded.daily_egp
       returning id`,
      [u.slug, u.kind, u.district, u.rent, u.daily, u.floor, u.periods, l.title_ar, l.title_en, l.summary_ar, l.summary_en, JSON.stringify(l.highlights_ar), JSON.stringify(l.highlights_en)]);
    const unitId = ins.rows[0].id;
    await p.query(`insert into specs (unit_id, data, model) values ($1,$2,'muse-spark-1.3') on conflict (unit_id) do update set data = excluded.data`, [unitId, JSON.stringify(specs)]);
    const media: [string, string | null, string][] = [
      ["keyframe", null, blob(u.slug, "real.jpg")],
      ...(u.slug === "full" ? ([["staged", "empty", blob(u.slug, "empty.jpg")]] as [string, string, string][]) : []),
      ["staged", "startup", blob(u.slug, "fit-startup.jpg")],
      ["staged", "clinic", blob(u.slug, "fit-clinic.jpg")],
      ["staged", "training", blob(u.slug, "fit-training.jpg")],
      ...(blobUrls[u.slug]?.["walkthrough.mp4"] ? ([["video", null, blob(u.slug, "walkthrough.mp4")]] as [string, string | null, string][]) : []),
    ];
    // Retire legacy local-path rows (/demo/..., /uploads/...) so they are
    // never served again, then upsert one current Blob row per kind/style.
    await p.query(`update media set is_current = false where unit_id = $1 and url not like 'https://%'`, [unitId]);
    for (const [kind, style, url] of media) {
      const upd = await p.query(
        `update media set url = $4, is_current = true where unit_id = $1 and kind = $2 and style is not distinct from $3 and url like 'https://%'`,
        [unitId, kind, style, url]);
      if ((upd.rowCount ?? 0) === 0)
        await p.query(`insert into media (unit_id, kind, style, url) values ($1,$2,$3,$4)`, [unitId, kind, style, url]);
    }
    await generateAvailability(unitId, "2026-10-27"); // today → AVAILABILITY_UNTIL, idempotent
    console.log("seeded", u.slug);
  }
  const c = await p.query<{ units: string; slots: string }>("select (select count(*) from units)::text as units, (select count(*) from availability)::text as slots");
  console.log(`seed ok — units=${c.rows[0].units} slots=${c.rows[0].slots}`);
  await p.end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
