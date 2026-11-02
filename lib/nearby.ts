// Read side of nearby places (plan/06 6.7 step 6): a unit's stored Google Places
// results (name, distance, Maps link) for the unit page and the agent.
import { pool } from "./db/pg";

export interface Nearby { place_id: string; name: string; distance_m: number; maps_url: string }

export async function nearbyOf(unitId: string): Promise<Nearby[]> {
  const { rows } = await pool().query<Nearby>(
    "select place_id, name, distance_m, maps_url from unit_places where unit_id = $1 order by distance_m", [unitId]);
  return rows;
}
