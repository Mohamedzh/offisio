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
export const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
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

// Place name in a Google Maps URL with no coordinates: /maps/place/<name>/... or ?q=<name>.
const MAPS_HOST = /^(www\.)?google\.[a-z.]+$|^maps\.google\.[a-z.]+$/i;
export function placeNameOf(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!MAPS_HOST.test(u.hostname)) return null;
  const seg = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  const raw = seg ?? u.searchParams.get("q") ?? u.searchParams.get("query");
  if (!raw) return null;
  const name = decodeURIComponent(raw.replace(/\+/g, " ")).trim();
  return name && !parseLatLng(name) ? name : null;
}

// Owner input: a Google Maps link (full or short) or "lat, lng". label: the place name when
// the link only named a place (shared links often do) and Google Places found it in Egypt.
// opts.expand false: short links are not followed (no redirect hops; e.g. a time-boxed webhook turn).
export async function resolveLocationDetailed(input: string, opts: { expand?: boolean } = {}): Promise<{ loc: LatLng; label: string | null } | null> {
  const text = input.trim();
  if (!text || text.length > 2000) return null;
  const direct = parseLatLng(text);
  if (direct) return { loc: direct, label: null };
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (SHORT_HOSTS.has(url.hostname) && opts.expand === false) return null;
  const expanded = SHORT_HOSTS.has(url.hostname) ? await expandShortLink(url).catch(() => null) : text;
  if (!expanded) return null;
  const parsed = parseLatLng(decodeURIComponent(expanded));
  if (parsed) return { loc: parsed, label: null };
  const name = placeNameOf(expanded);
  if (!name) return null;
  const hit = await (await import("./places")).placeByName(name).catch(() => null);
  if (!hit) return null;
  const loc = { lat: Math.round(hit.lat * 1e6) / 1e6, lng: Math.round(hit.lng * 1e6) / 1e6 };
  return inEgypt(loc) ? { loc, label: hit.label } : null;
}
export async function resolveLocation(input: string, opts: { expand?: boolean } = {}): Promise<LatLng | null> {
  return (await resolveLocationDetailed(input, opts))?.loc ?? null;
}

// Renter "near me" location (web 📍 or a WhatsApp pin). Set by the server only, never by
// the model. Rounded to 3 decimals (about 100 m) before any use or storage; never logged.
// Coarse bounding box around Egypt (also admits bits of neighbours); the catalogue is Egypt-only.
export const RENTER_EGYPT = { lat: [22, 32], lng: [24, 37] } as const;
export const roundLoc = (p: LatLng): LatLng => ({ lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 });
export type RenterLocation = { ok: true; loc: LatLng } | { ok: false; code: "LOCATION_BAD" | "LOCATION_OUTSIDE_EGYPT" };
export function renterLocation(raw: unknown): RenterLocation {
  const r = raw as { lat?: unknown; lng?: unknown } | null;
  const lat = typeof r?.lat === "number" ? r.lat : NaN, lng = typeof r?.lng === "number" ? r.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, code: "LOCATION_BAD" };
  const loc = roundLoc({ lat, lng });
  const [la0, la1] = RENTER_EGYPT.lat, [ln0, ln1] = RENTER_EGYPT.lng;
  if (loc.lat < la0 || loc.lat > la1 || loc.lng < ln0 || loc.lng > ln1) return { ok: false, code: "LOCATION_OUTSIDE_EGYPT" };
  return { ok: true, loc };
}

// Owner pin for a unit (8.1 WhatsApp location): finite, inside the same Egypt box as
// parseLatLng, kept at the column's 6 decimals (unit location, not a renter's). Never logged.
export function ownerLocation(raw: unknown): LatLng | null {
  const r = raw as { lat?: unknown; lng?: unknown } | null;
  const lat = typeof r?.lat === "number" ? r.lat : NaN, lng = typeof r?.lng === "number" ? r.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  return inEgypt(p) ? p : null;
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
