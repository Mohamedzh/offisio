// Seed the 3 demo units (specs/listing from the video pipeline), media,
// and 7 days x 10:00-17:00 hourly availability. Run after migrate: pnpm seed
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../lib/db/pg";

interface Listing { title_ar: string; title_en: string; summary_ar: string; summary_en: string; highlights_ar: string[]; highlights_en: string[] }
const UNITS = [
  { slug: "full", kind: "furnished", periods: ["daily", "monthly"], daily: 800 },
  { slug: "empty1", kind: "semifinished", periods: ["long_term"], daily: null },
  { slug: "empty2", kind: "semifinished", periods: ["long_term"], daily: null },
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
       values ($1,$2,'Cairo',10000,$3,'1st to 7th','2026-10-27',$4,$5,$6,$7,$8,$9,$10)
       on conflict (slug) do update set title_ar = excluded.title_ar, title_en = excluded.title_en, summary_ar = excluded.summary_ar, summary_en = excluded.summary_en,
         highlights_ar = excluded.highlights_ar, highlights_en = excluded.highlights_en, rent_periods = excluded.rent_periods, daily_egp = excluded.daily_egp
       returning id`,
      [u.slug, u.kind, u.daily, u.periods, l.title_ar, l.title_en, l.summary_ar, l.summary_en, JSON.stringify(l.highlights_ar), JSON.stringify(l.highlights_en)]);
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
    for (const [kind, style, url] of media)
      await p.query(`insert into media (unit_id, kind, style, url) select $1,$2,$3,$4 where not exists (select 1 from media where unit_id = $1 and kind = $2 and style is not distinct from $3 and url = $4)`, [unitId, kind, style, url]);
    for (let d = 0; d < 7; d++) {
      const date = new Date(Date.UTC(2026, 9, 27 + d)).toISOString().slice(0, 10);
      for (let h = 10; h < 17; h++)
        await p.query(`insert into availability (unit_id, starts_at, ends_at) values ($1, ($2::date + $3::int * interval '1 hour') at time zone 'Africa/Cairo', ($2::date + ($3::int + 1) * interval '1 hour') at time zone 'Africa/Cairo') on conflict (unit_id, starts_at) do nothing`, [unitId, date, h]);
    }
    console.log("seeded", u.slug);
  }
  const c = await p.query<{ units: string; slots: string }>("select (select count(*) from units)::text as units, (select count(*) from availability)::text as slots");
  console.log(`seed ok — units=${c.rows[0].units} slots=${c.rows[0].slots}`);
  await p.end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
