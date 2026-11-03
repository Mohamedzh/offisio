// Read side of nearby places (plan/06 6.7 step 6): a unit's stored Google Places
// results (name, distance, Maps link) for the unit page and the agent.
import { pool } from "./db/pg";

// name is null for seeded places (data/seed keeps only place_id; Places terms)
// until pnpm seed fills it with GOOGLE_PLACES_API_KEY set.
export interface Nearby { place_id: string; name: string | null; distance_m: number; maps_url: string }

// Shown distance, shared by the unit page and the agent so both say the same:
// nearest 10 m under 1 km, else nearest 100 m.
export const roundDistanceM = (m: number): number => (m < 1000 ? Math.round(m / 10) * 10 : Math.round(m / 100) * 100);

export async function nearbyOf(unitId: string): Promise<Nearby[]> {
  const { rows } = await pool().query<Nearby>(
    "select place_id, name, distance_m, maps_url from unit_places where unit_id = $1 order by distance_m", [unitId]);
  return rows;
}
