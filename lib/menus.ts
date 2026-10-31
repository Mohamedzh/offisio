// Brand menus (plan/06 6.7 step 3): source files in data/seed/menus/ (one-off
// elmenus capture, AGENTS rule 2 exception) -> 10-15 office add-on picks per brand.
// Muse (meta.public: public data) only picks and names items; every price is
// copied from the source file by code and re-checked before saving.
import { meta, publicModel } from "./meta/client";
import { MENU_PROMPT_V1, MENU_PROMPT_VERSION } from "./meta/prompts";
import { cached } from "./pipeline/cache";

export interface SourceSize { size: string; price_egp: number }
export interface SourceMenu {
  brand: string; source: string; source_label: string; restaurant_url: string; branch_code: string; fetched_at: string;
  categories: { name: string; items: { name: string; description: string; sizes: SourceSize[] }[] }[];
}
export interface Candidate { id: string; category: string; name: string; description: string; sizes: SourceSize[] }
export const MENU_CATEGORIES = ["coffee", "tea", "cold_drink", "bakery", "breakfast", "sandwich", "meal", "dessert", "snack"] as const;
export interface MenuItem { name_en: string; name_ar: string; source_name: string; size: string; price_egp: number; category: (typeof MENU_CATEGORIES)[number] }
export interface NormalisedMenu { aliases: string[]; items: MenuItem[] }

const MAX_CANDIDATES = 120;
const SKIP_NAME = /\b(extra|add[- ]?on|replace|sauce|dip|topping|kids?|family|party|box of|bucket|kilo|kg)\b/i;
const BY_WEIGHT = /kilo|kg|gram|gm?/i;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Price outliers are excluded, never "fixed" (owner 2026-10-31): over 3000 EGP,
// sizes spread more than 8x (per-kilo pricing), or over 6x the category median (source typos).
export function isOutlier(sizes: SourceSize[], categoryMedian: number): boolean {
  const ps = sizes.map((s) => s.price_egp);
  const max = Math.max(...ps), min = Math.min(...ps);
  return max > 3000 || (ps.length > 1 && max > 8 * min) || (categoryMedian > 0 && max > 6 * categoryMedian);
}

export function candidatesOf(menu: SourceMenu): { candidates: Candidate[]; excluded: string[] } {
  const excluded: string[] = []; const byCat: Candidate[][] = [];
  menu.categories.forEach((c, ci) => {
    const med = median(c.items.flatMap((i) => i.sizes.map((s) => s.price_egp)));
    const list: Candidate[] = [];
    c.items.forEach((i, ii) => {
      if (isOutlier(i.sizes, med)) { excluded.push(`${i.name} [${i.sizes.map((s) => s.price_egp).join(", ")}]`); return; }
      const sizes = i.sizes.filter((s) => !BY_WEIGHT.test(s.size));
      if (!sizes.length || SKIP_NAME.test(`${c.name} ${i.name}`)) return;
      list.push({ id: `c${ci}i${ii}`, category: c.name, name: i.name, description: i.description.slice(0, 70), sizes });
    });
    byCat.push(list);
  });
  // Round-robin across categories so one long category cannot crowd out the rest.
  const candidates: Candidate[] = [];
  for (let k = 0; candidates.length < MAX_CANDIDATES && byCat.some((l) => l[k]); k++)
    for (const l of byCat) if (l[k] && candidates.length < MAX_CANDIDATES) candidates.push(l[k]);
  return { candidates, excluded };
}

const line = (c: Candidate) => `${c.id} | ${c.category} | ${c.name} | sizes: ${c.sizes.map((s) => `${s.size} ${s.price_egp}`).join(", ")}${c.description ? ` | ${c.description}` : ""}`;
const parseJson = (t: string): unknown => JSON.parse(t.replace(/^```json\s*|\s*```$/g, "").trim());
const ARABIC = /[؀-ۿ]/;

// Model output -> menu items with prices copied from the candidates. Throws on anything off.
export function validateMenu(raw: unknown, candidates: Candidate[]): NormalisedMenu {
  const r = raw as { aliases?: unknown; items?: unknown };
  if (!Array.isArray(r?.items)) throw new Error("items must be an array");
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>(); const items: MenuItem[] = [];
  for (const it of r.items as Record<string, unknown>[]) {
    const c = byId.get(String(it.id));
    if (!c) throw new Error(`unknown id ${it.id}`);
    if (seen.has(c.id)) continue;
    // Models sometimes echo "Medium 115": accept the trailing number only when it equals the source price.
    const m = String(it.size ?? "").trim().match(/^(.*?)\s+(\d+(?:\.\d+)?)$/);
    const size = c.sizes.find((s) => s.size === it.size)
      ?? (m ? c.sizes.find((s) => s.size === m[1] && s.price_egp === Number(m[2])) : undefined)
      ?? (c.sizes.length === 1 ? c.sizes[0] : undefined);
    if (!size) throw new Error(`size "${it.size}" not in ${c.id}`);
    const name_en = String(it.name_en ?? "").trim(), name_ar = String(it.name_ar ?? "").trim();
    if (!name_en || !ARABIC.test(name_ar)) throw new Error(`names missing for ${c.id}`);
    if (!(MENU_CATEGORIES as readonly string[]).includes(String(it.category))) throw new Error(`bad category for ${c.id}`);
    seen.add(c.id);
    items.push({ name_en, name_ar, source_name: c.name, size: size.size, price_egp: size.price_egp, category: it.category as MenuItem["category"] });
  }
  if (items.length < 8 || items.length > 15) throw new Error(`expected 10-15 items, got ${items.length}`);
  const aliases = [...new Set((Array.isArray(r.aliases) ? r.aliases : []).map((a) => String(a).trim()).filter((a) => a && a.length <= 60))].slice(0, 8);
  return { aliases, items };
}

// Final guard: every saved price must exist verbatim in the source file for that item and size.
export function assertPricesFromSource(menu: NormalisedMenu, source: SourceMenu): void {
  for (const it of menu.items) {
    const ok = source.categories.some((c) => c.items.some((i) => i.name === it.source_name && i.sizes.some((s) => s.size === it.size && s.price_egp === it.price_egp)));
    if (!ok) throw new Error(`price not in source: ${source.brand} ${it.source_name} ${it.size} ${it.price_egp}`);
  }
}

export async function normaliseMenu(source: SourceMenu, candidates: Candidate[]): Promise<NormalisedMenu> {
  const model = publicModel();
  const user = `Brand: ${source.brand}\nCandidates:\n${candidates.map(line).join("\n")}`;
  return cached("brand_menu", model, MENU_PROMPT_VERSION, [MENU_PROMPT_V1, user], async () => {
    const messages = [{ role: "system", content: MENU_PROMPT_V1 }, { role: "user", content: user }];
    let err = "";
    for (let i = 0; i < 2; i++) {
      const r = (await meta.public.chat({
        messages: err ? [...messages, { role: "user", content: `Previous reply failed validation: ${err}. Reply with valid JSON only.` }] : messages,
        temperature: 0.2,
      })) as { choices?: { message?: { content?: string } }[] };
      try {
        const content = r.choices?.[0]?.message?.content;
        if (!content) throw new Error("empty model reply");
        return validateMenu(parseJson(content), candidates);
      } catch (e) { err = (e as Error).message; }
    }
    throw new Error(`${source.brand}: JSON validation failed twice: ${err}`);
  });
}
