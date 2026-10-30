// Content-hash cache for model results (docs/plan/06 6.3). A re-run on an
// unchanged input (same bytes, prompt text and model) costs nothing. Callers
// put the prompt text itself in `parts`, so editing a prompt invalidates.
// The model is part of the key, so dev contributor results are never served
// to production.
import { createHash } from "node:crypto";
import { pool } from "../db/pg";

export function cacheKey(kind: string, model: string, promptVersion: string, parts: (string | Buffer)[]): string {
  const h = createHash("sha256").update(`${kind}|${model}|${promptVersion}`);
  for (const p of parts) h.update("|").update(p);
  return h.digest("hex");
}

export async function cached<T>(kind: string, model: string, promptVersion: string, parts: (string | Buffer)[], run: () => Promise<T>): Promise<T> {
  const key = cacheKey(kind, model, promptVersion, parts);
  const hit = await pool().query<{ result: T }>("select result from ai_cache where key = $1", [key]);
  if (hit.rows[0]) { console.log(`[cache] hit ${kind}`); return hit.rows[0].result; }
  const result = await run();
  await pool().query(
    "insert into ai_cache (key, kind, model, prompt_version, result) values ($1, $2, $3, $4, $5) on conflict (key) do nothing",
    [key, kind, model, promptVersion, JSON.stringify(result)]);
  return result;
}
