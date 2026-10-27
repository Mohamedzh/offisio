// Per-unit pipeline: probe -> specs -> listing -> empty -> restage.
// Usage: UNIT=full|empty1|empty2 STEP=all|probe|specs|listing|empty|restage pnpm pipeline
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { meta, requireKey } from "../lib/meta/client";
import { OWNERS, SPECS_PROMPT_V1, LISTING_PROMPT_V1, EMPTY_PROMPT_V1, STYLE_PROMPTS_V1 } from "../lib/meta/prompts";

const UNIT = process.env.UNIT ?? "full";
const O = OWNERS[UNIT];
if (!O) throw new Error(`unknown UNIT=${UNIT} (known: ${Object.keys(OWNERS).join(", ")})`);
const OUT = `.scratch/${UNIT}`;
mkdirSync(OUT, { recursive: true });
const step = process.env.STEP ?? "all";
const b64 = (p: string) => readFileSync(p).toString("base64");
const frames = (UNIT === "full" ? [1, 2, 3, 4] : [1, 5, 6, 7]).map((n) => `${OUT}/keyframes/frame-0${n}.jpg`);
const hero = `${OUT}/hero.jpg`;

interface Specs { area_m2_estimate: number | null; desk_capacity: number | null; condition: string | null; confidence: { desk_capacity: number } }
function validateSpecs(s: Specs): Specs {
  for (const k of ["area_m2_estimate", "windows_count", "has_ac", "desk_capacity", "condition", "natural_light", "confidence"] as const)
    if (!(k in s)) throw new Error(`specs missing ${k}`);
  if (typeof s.confidence?.desk_capacity !== "number") throw new Error("specs.confidence invalid");
  return s;
}
const parseJson = (t: string) => JSON.parse(t.replace(/^```json\s*|\s*```$/g, "").trim());

type Msg = { role: string; content: unknown };
async function chatJson<T>(messages: Msg[]): Promise<T> {
  let err = "";
  for (let i = 0; i < 2; i++) {
    const r = (await meta.product.chat({
      messages: err ? [...messages, { role: "user", content: `Previous reply failed validation: ${err}. Reply with valid JSON only.` }] : messages,
      temperature: 0.2,
    })) as { choices: { message: { content: string } }[] };
    try { return parseJson(r.choices[0].message.content) as T; } catch (e) { err = (e as Error).message; }
  }
  throw new Error("JSON parse failed twice: " + err);
}

async function saveImage(result: { data?: { b64_json?: string; url?: string }[] }, name: string) {
  const d = result.data?.[0];
  if (!d) throw new Error("no image in response: " + JSON.stringify(result).slice(0, 400));
  if (d.b64_json) writeFileSync(`${OUT}/${name}`, Buffer.from(d.b64_json, "base64"));
  else if (d.url) writeFileSync(`${OUT}/${name}`, Buffer.from(await (await fetch(d.url)).arrayBuffer()));
  else throw new Error("image response has neither b64_json nor url");
  console.log("saved", name);
}

const steps: Record<string, () => Promise<unknown>> = {
  async probe() {
    const m = await meta.models();
    const ids = (m.data ?? []).map((x) => x.id);
    console.log("models:", ids.join(", "));
    writeFileSync(`${OUT}/models.json`, JSON.stringify(ids, null, 2));
  },
  async specs() {
    const content = [
      { type: "text", text: `Owner fields: district=${O.district}, rent_egp=${O.rent_egp}, floors=${O.floor_text}, available_from=${O.available_from}, kind=${O.kind}. Keyframes in walk order follow.` },
      ...frames.map((p) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64(p)}` } })),
    ];
    const s = validateSpecs(await chatJson<Specs>([{ role: "system", content: SPECS_PROMPT_V1 }, { role: "user", content }]));
    writeFileSync(`${OUT}/specs.json`, JSON.stringify({ owner: O, specs: s }, null, 2));
    console.log(JSON.stringify(s, null, 2));
    return s;
  },
  async listing() {
    const { specs } = JSON.parse(readFileSync(`${OUT}/specs.json`, "utf8")) as { specs: Specs };
    const l = await chatJson<{ title_ar: string; title_en: string; highlights_ar: string[] }>([
      { role: "system", content: LISTING_PROMPT_V1 },
      { role: "user", content: `Specs: ${JSON.stringify(specs)}\nOwner: ${JSON.stringify(O)}` },
    ]);
    if (!l.title_ar || !l.title_en || !Array.isArray(l.highlights_ar)) throw new Error("listing shape invalid");
    writeFileSync(`${OUT}/listing.json`, JSON.stringify(l, null, 2));
    console.log(JSON.stringify(l, null, 2));
    return l;
  },
  async empty() { await saveImage(await meta.imageEdit({ imagePath: hero, prompt: EMPTY_PROMPT_V1 }), "empty.jpg"); },
  async restage() {
    // Bare/semifinished units skip removal: restage straight from hero.
    const base = O.kind === "furnished" ? `${OUT}/empty.jpg` : hero;
    for (const [k, p] of Object.entries(STYLE_PROMPTS_V1))
      await saveImage(await meta.imageEdit({ imagePath: base, prompt: p }), `style-${k}.jpg`);
  },
};

async function main() {
  requireKey();
  if (!existsSync(hero)) throw new Error("hero missing: " + hero);
  for (const s of ["probe", "specs", "listing", "empty", "restage"])
    if (step === "all" || step === s) await steps[s]();
  console.log("DONE unit=" + UNIT + " step=" + step);
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
