// Nearby places (plan/06 6.7 step 4): Google Places Nearby Search (New) around a
// unit, then match each place to a brand_menus chain. A plain-text pre-filter over
// brand aliases picks up to 5 candidates; only then does one meta.public call (public
// place names) decide the brand or none. We store only what we show (Places terms).
import { pool } from "./db/pg";
import { meta, publicModel } from "./meta/client";
import { PLACE_MATCH_V1, PLACE_MATCH_VERSION } from "./meta/prompts";
import { cached } from "./pipeline/cache";
import type { LatLng } from "./geo";

export const RADIUS_M = 1000;
export const KEEP = 2;
const TYPES = ["cafe", "coffee_shop", "restaurant", "bakery"];
// Pro SKU fields only (no Enterprise fields such as rating or hours).
const FIELD_MASK = "places.id,places.displayName,places.location,places.primaryType,places.googleMapsUri";

export interface NearbyPlace { place_id: string; name: string; primary_type: string | null; distance_m: number; maps_url: string }
export interface Brand { brand: string; aliases: string[] }

export function haversineM(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180, R = 6371000;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function searchNearby(at: LatLng): Promise<NearbyPlace[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY missing");
  const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      includedTypes: TYPES, maxResultCount: 20, rankPreference: "DISTANCE", languageCode: "en",
      locationRestriction: { circle: { center: { latitude: at.lat, longitude: at.lng }, radius: RADIUS_M } },
    }),
  });
  if (!r.ok) throw new Error(`places ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { places?: { id: string; displayName?: { text?: string }; location?: { latitude: number; longitude: number }; primaryType?: string; googleMapsUri?: string }[] };
  return (j.places ?? []).filter((p) => p.id && p.displayName?.text && p.location).map((p) => ({
    place_id: p.id, name: p.displayName!.text!, primary_type: p.primaryType ?? null,
    distance_m: haversineM(at, { lat: p.location!.latitude, lng: p.location!.longitude }),
    maps_url: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
  })).sort((a, b) => a.distance_m - b.distance_m);
}

// Text pre-filter: normalise Arabic/English, drop generic words, score alias overlap.
const GENERIC = new Set(["cafe", "caffe", "coffee", "restaurant", "restaurants", "egypt", "branch", "the", "and", "co", "مطعم", "كافيه", "كافية", "فرع", "مصر"]);
export function normName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ًͯ-ٟ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/['’`]/g, "")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();
}
const tokens = (s: string) => normName(s).split(" ").filter((t) => t.length > 1 && !GENERIC.has(t));
function score(place: string, alias: string): number {
  const p = tokens(place), a = tokens(alias);
  if (!a.length || !p.length) return 0;
  const pj = ` ${p.join(" ")} `, aj = a.join(" ");
  if (pj.includes(` ${aj} `)) return 1;
  return a.filter((t) => p.includes(t)).length / a.length;
}
export function candidateBrands(placeName: string, brands: Brand[]): string[] {
  return brands.map((b) => ({ brand: b.brand, s: Math.max(...b.aliases.map((a) => score(placeName, a))) }))
    .filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 5).map((x) => x.brand);
}

const parseJson = (t: string): unknown => JSON.parse(t.replace(/^```json\s*|\s*```$/g, "").trim());

export async function matchBrand(place: NearbyPlace, brands: Brand[]): Promise<string | null> {
  const cands = candidateBrands(place.name, brands);
  if (!cands.length) return null;
  const list = cands.map((c) => `- ${c}: ${brands.find((b) => b.brand === c)!.aliases.slice(0, 6).join(" / ")}`).join("\n");
  const user = `Place: "${place.name}" (type ${place.primary_type ?? "unknown"})\nCandidates:\n${list}`;
  const r = await cached("place_match", publicModel(), PLACE_MATCH_VERSION, [PLACE_MATCH_V1, user], async () => {
    const res = (await meta.public.chat({ messages: [{ role: "system", content: PLACE_MATCH_V1 }, { role: "user", content: user }], temperature: 0 })) as { choices?: { message?: { content?: string } }[] };
    const raw = parseJson(res.choices?.[0]?.message?.content ?? "{}") as { brand?: unknown };
    return { brand: typeof raw.brand === "string" && cands.includes(raw.brand) ? raw.brand : null };
  });
  return r.brand;
}

export async function loadBrands(): Promise<Brand[]> {
  const { rows } = await pool().query<Brand>("select brand, aliases from brand_menus");
  return rows;
}

// Keep up to KEEP places: matched chains first (nearest), then the nearest others.
// Model calls stop once KEEP chains are matched.
export async function pickPlaces(found: NearbyPlace[], brands: Brand[]): Promise<(NearbyPlace & { brand: string | null })[]> {
  const matched: (NearbyPlace & { brand: string })[] = [];
  for (const p of found) {
    if (matched.length >= KEEP) break;
    const brand = await matchBrand(p, brands);
    if (brand && !matched.some((m) => m.brand === brand)) matched.push({ ...p, brand });
  }
  const rest = found.filter((p) => !matched.some((m) => m.place_id === p.place_id)).map((p) => ({ ...p, brand: null }));
  return [...matched, ...rest].slice(0, KEEP).sort((a, b) => a.distance_m - b.distance_m);
}

export async function savePlaces(unitId: string, places: (NearbyPlace & { brand: string | null })[]): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("delete from unit_places where unit_id = $1", [unitId]);
    for (const p of places)
      await client.query(
        `insert into unit_places (unit_id, place_id, name, primary_type, distance_m, maps_url, brand, menu_source)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [unitId, p.place_id, p.name, p.primary_type, p.distance_m, p.maps_url, p.brand, p.brand ? "elmenus" : null]);
    await client.query("commit");
  } catch (e) { try { await client.query("rollback"); } catch { /* noop */ } throw e; }
  finally { client.release(); }
}

export async function refreshPlaces(unitId: string, at: LatLng): Promise<(NearbyPlace & { brand: string | null })[]> {
  const picked = await pickPlaces(await searchNearby(at), await loadBrands());
  await savePlaces(unitId, picked);
  return picked;
}
