// Unit location (plan/06 6.7 step 1): parse an owner's Google Maps link or
// "lat, lng" text into coordinates, plus approximate district centres for
// seeded units. No map library; "Open in Maps" is a plain search URL.
export interface LatLng { lat: number; lng: number }

// Egypt's bounding box with margin; the catalogue is Egypt-only.
const inEgypt = (p: LatLng) => p.lat >= 21.5 && p.lat <= 32 && p.lng >= 24.5 && p.lng <= 37;

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
// Most specific first: !3d!4d is the place pin, @ is the map centre.
const PATTERNS = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
  new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=${NUM}(?:,|%2C)\s*${NUM}`, "i"),
  new RegExp(String.raw`@${NUM},${NUM}`),
  new RegExp(String.raw`^\s*${NUM}\s*[, ]\s*${NUM}\s*$`),
];

export function parseLatLng(text: string): LatLng | null {
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const p = { lat: Number(m[1]), lng: Number(m[2]) };
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng) && inEgypt(p)) return p;
  }
  return null;
}

// Short links carry no coordinates; follow their redirects (Google hosts only, no SSRF).
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
async function expandShortLink(url: URL): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!SHORT_HOSTS.has(current.hostname)) return current.toString();
    const r = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const next = r.headers.get("location");
    if (!next) return null;
    current = new URL(next, current);
  }
  return current.toString();
}

// Owner input: a Google Maps link (full or short) or "lat, lng".
export async function resolveLocation(input: string): Promise<LatLng | null> {
  const text = input.trim();
  if (!text || text.length > 2000) return null;
  const direct = parseLatLng(text);
  if (direct) return direct;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const expanded = SHORT_HOSTS.has(url.hostname) ? await expandShortLink(url).catch(() => null) : text;
  return expanded ? parseLatLng(decodeURIComponent(expanded)) : null;
}

export const mapsUrl = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// Approximate district centres for seeded units (labelled "approximate area"
// on the unit page). Keyed by slug; values are public district centroids.
export const SEED_DISTRICTS: Record<string, LatLng> = {
  // `full` (filmed) is pinned exactly from a Maps link: pnpm backfill-locations --slug full --at <link>
  empty1: { lat: 30.0566, lng: 31.3301 },             // Nasr City
  empty2: { lat: 30.0300, lng: 31.4700 },             // New Cairo
  "gen-zamalek": { lat: 30.0609, lng: 31.2194 },
  "gen-heliopolis": { lat: 30.0911, lng: 31.3225 },
  "gen-new-cairo": { lat: 30.0118, lng: 31.4312 },    // 5th Settlement
  "gen-downtown": { lat: 30.0487, lng: 31.2386 },     // Talaat Harb
  "gen-sheikh-zayed": { lat: 30.0444, lng: 30.9800 },
  "gen-alex-smouha": { lat: 31.2156, lng: 29.9437 },
  "gen-alex-chatby": { lat: 31.2083, lng: 29.9176 },
  "gen-alex-louran": { lat: 31.2095, lng: 29.9105 }, // by the Bibliotheca, Chatby side (owner 2026-10-31)
  "gen-october": { lat: 30.0710, lng: 31.0170 },      // near Smart Village
  "gen-nasr-city": { lat: 30.0626, lng: 31.3430 },
};
