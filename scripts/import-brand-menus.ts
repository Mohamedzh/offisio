// Normalise the captured brand menus into brand_menus (plan/06 6.7 step 3).
// Source: data/seed/chain-brands.json + data/seed/menus/<brand>.json (one-off elmenus capture).
// Muse via meta.public picks/names 10-15 office add-ons per brand; prices are copied from the
// source and re-checked. Cached by content, so re-runs are free.
//   pnpm import-brand-menus --dry            counts, exclusions, estimated calls; no model calls, no writes
//   pnpm import-brand-menus [--only "Second Cup,Costa Coffee"]
import { existsSync, readFileSync } from "node:fs";
import { pool } from "../lib/db/pg";
import { publicModel } from "../lib/meta/client";
import { MENU_PROMPT_VERSION } from "../lib/meta/prompts";
import { assertPricesFromSource, candidatesOf, normaliseMenu, type SourceMenu } from "../lib/menus";

interface Brand { brand: string; name_ar: string; kind: string; elmenus: string | null }
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const dry = process.argv.includes("--dry");
  const only = arg("--only")?.split(",").map((s) => s.trim());
  const brands = (JSON.parse(readFileSync("data/seed/chain-brands.json", "utf8")) as { brands: Brand[] }).brands
    .filter((b) => !only || only.includes(b.brand));
  const model = publicModel();
  console.log(`${brands.length} brands, model ${model}${dry ? " (dry run: no model calls, no writes)" : ""}`);
  let calls = 0, chars = 0, done = 0; const failed: string[] = [];
  for (const b of brands) {
    const file = `data/seed/menus/${slugify(b.brand)}.json`;
    if (!existsSync(file)) { failed.push(`${b.brand}: no source file`); continue; }
    const source = JSON.parse(readFileSync(file, "utf8")) as SourceMenu;
    const { candidates, excluded } = candidatesOf(source);
    const total = source.categories.reduce((n, c) => n + c.items.length, 0);
    if (dry) {
      calls++; chars += candidates.reduce((n, c) => n + c.name.length + c.description.length + 40, 0);
      console.log(`${b.brand}: ${total} items -> ${candidates.length} candidates${excluded.length ? `, excluded ${excluded.length} price outliers: ${excluded.slice(0, 3).join("; ")}${excluded.length > 3 ? " ..." : ""}` : ""}`);
      continue;
    }
    try {
      const menu = await normaliseMenu(source, candidates);
      assertPricesFromSource(menu, source);
      const aliases = [...new Set([b.brand, b.name_ar, ...menu.aliases])];
      await pool().query(
        `insert into brand_menus (brand, name_ar, kind, source, source_label, restaurant_url, fetched_at, aliases, items, source_items, model, prompt_version, normalised_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         on conflict (brand) do update set name_ar = excluded.name_ar, kind = excluded.kind, source_label = excluded.source_label,
           restaurant_url = excluded.restaurant_url, fetched_at = excluded.fetched_at, aliases = excluded.aliases, items = excluded.items,
           source_items = excluded.source_items, model = excluded.model, prompt_version = excluded.prompt_version, normalised_at = now()`,
        [b.brand, b.name_ar, b.kind, source.source, source.source_label, source.restaurant_url, source.fetched_at,
         JSON.stringify(aliases), JSON.stringify(menu.items), total, model, MENU_PROMPT_VERSION]);
      done++;
      console.log(`ok ${b.brand}: ${menu.items.length} items, aliases ${aliases.length}`);
    } catch (e) { failed.push(`${b.brand}: ${(e as Error).message}`); console.log(`FAIL ${b.brand}: ${(e as Error).message}`); }
  }
  if (dry) console.log(`\nwould make ${calls} model calls (+ up to ${calls} validation retries), ~${Math.round((chars / 4 + calls * 450) / 1000)}k input tokens; ${model.startsWith("meta-models/") ? "Modal credits, $0 Meta spend" : "contributor list price ~$0.10/M in, $0.20/M out"}`);
  else console.log(`\n${done} saved, ${failed.length} failed`);
  if (failed.length) console.log(failed.join("\n"));
  await pool().end();
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
