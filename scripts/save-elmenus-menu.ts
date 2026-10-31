// One-off brand-menu import helper (plan/06 6.7 step 3, AGENTS rule 2 exception).
// Turns menu responses captured in the browser (the page's own request to
// elmenus.com/api/steering/restaurant/v1/branches/<code>/menu) into slim source
// files data/seed/menus/<brand-slug>.json. Prices are copied exactly; nothing is generated.
// Run: npx tsx scripts/save-elmenus-menu.ts <response-file> <brand> <restaurant-slug> <branch-code>
//      npx tsx scripts/save-elmenus-menu.ts --dump <capture.json>   (map of restaurant slug -> { url, menu })
import { readFileSync, writeFileSync } from "node:fs";

interface Size { sizeName: string; price: number }
interface Item { name: string; description?: string; sizes?: Size[] }
interface Menu { name?: string; categories?: { name: string; items?: Item[] }[] }
interface Brand { brand: string; elmenus: string | null }

export const SOURCE_LABEL = "Menu source: elmenus.com (demo data, not affiliated)";
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function save(menu: Menu, brand: string, restaurant: string, branch: string): string {
  const categories = (menu.categories ?? []).map((c) => ({
    name: c.name,
    items: (c.items ?? [])
      .map((i) => ({ name: i.name.trim(), description: (i.description ?? "").trim(), sizes: (i.sizes ?? []).filter((s) => Number.isFinite(s.price) && s.price > 0).map((s) => ({ size: s.sizeName, price_egp: s.price })) }))
      .filter((i) => i.sizes.length),
  })).filter((c) => c.items.length);
  const out = {
    brand, source: "elmenus.com", source_label: SOURCE_LABEL,
    restaurant_url: `https://elmenus.com/cairo/${restaurant}`, branch_code: branch,
    fetched_at: new Date().toISOString(), categories,
  };
  const path = `data/seed/menus/${slugify(brand)}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  return `${path}: ${categories.length} categories, ${categories.reduce((n, c) => n + c.items.length, 0)} items`;
}

const branchOf = (url: string) => url.match(/branches\/([^/]+)\/menu/)?.[1] ?? "";
const args = process.argv.slice(2);
if (args[0] === "--dump") {
  const raw = JSON.parse(readFileSync(args[1], "utf8")) as { results?: Record<string, { url?: string; menu?: Menu; error?: string }> };
  const results = raw.results ?? (raw as Record<string, { url?: string; menu?: Menu; error?: string }>);
  const brands = (JSON.parse(readFileSync("data/seed/chain-brands.json", "utf8")) as { brands: Brand[] }).brands;
  const bySlug = new Map(brands.filter((b) => b.elmenus).map((b) => [b.elmenus!.replace(/^cairo\//, ""), b.brand]));
  for (const [restaurant, r] of Object.entries(results)) {
    const brand = bySlug.get(restaurant);
    if (!brand) { console.log(`skip ${restaurant}: not in chain-brands.json`); continue; }
    if (!r.menu || !r.url) { console.log(`FAIL ${brand}: ${r.error ?? "no menu"}`); continue; }
    console.log(save(r.menu, brand, restaurant, branchOf(r.url)));
  }
} else {
  const [file, brand, restaurant, branch] = args;
  if (!file || !brand || !restaurant || !branch) throw new Error("usage: <response-file> <brand> <restaurant-slug> <branch-code> | --dump <capture.json>");
  console.log(save(JSON.parse(readFileSync(file, "utf8")) as Menu, brand, restaurant, branch));
}
