// Nearby places (plan/06 6.7 step 4): Google Places Nearby Search (New) around a
// unit; we keep the 2 nearest food places. We store only what we show (Places terms):
// name, type, distance and the Google Maps link. No model calls.
import { pool } from "./db/pg";
import type { LatLng } from "./geo";

export const RADIUS_M = 1000;
export const KEEP = 2;
const TYPES = ["cafe", "coffee_shop", "restaurant", "bakery"];
// Pro SKU fields only (no Enterprise fields such as rating or hours).
const FIELD_MASK = "places.id,places.displayName,places.location,places.primaryType,places.googleMapsUri";

export interface NearbyPlace { place_id: string; name: string; primary_type: string | null; distance_m: number; maps_url: string }

export function haversineM(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180, R = 6371000;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// The 20 nearest cafes/restaurants/bakeries within RADIUS_M, nearest first.
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

// Arabic/English name normalisation (used by lib/landmarks.ts alias matching).
export function normName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ًͯ-ٟ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/['’`]/g, "")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();
}

// Only food places (no supply shops, buildings or play areas).
const FOOD = /cafe|coffee|restaurant|bakery|dessert|ice_cream|sandwich|juice|tea_house|confectionery|food/;
const isFood = (p: NearbyPlace) => !!p.primary_type && FOOD.test(p.primary_type) && !/supplier|store$/.test(p.primary_type);

export const pickPlaces = (found: NearbyPlace[]): NearbyPlace[] => found.filter(isFood).slice(0, KEEP);

export async function savePlaces(unitId: string, places: NearbyPlace[]): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("delete from unit_places where unit_id = $1", [unitId]);
    for (const p of places)
      await client.query(
        `insert into unit_places (unit_id, place_id, name, primary_type, distance_m, maps_url) values ($1,$2,$3,$4,$5,$6)`,
        [unitId, p.place_id, p.name, p.primary_type, p.distance_m, p.maps_url]);
    await client.query("commit");
  } catch (e) { try { await client.query("rollback"); } catch { /* noop */ } throw e; }
  finally { client.release(); }
}

// One Nearby Search ranked by distance, keep the 2 nearest food places.
export async function refreshPlaces(unitId: string, at: LatLng): Promise<NearbyPlace[]> {
  const picked = pickPlaces(await searchNearby(at));
  await savePlaces(unitId, picked);
  return picked;
}
