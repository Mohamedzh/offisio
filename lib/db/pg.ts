// Neon Postgres pool. App runtime uses the POOLED string (PgBouncer,
// serverless traffic); migrations use the DIRECT string (scripts/migrate.ts).
import { Pool } from "pg";
import { loadEnvLocal } from "../meta/client";

loadEnvLocal();

const g = globalThis as unknown as { __offisioPool?: Pool };
export function pool(): Pool {
  if (!g.__offisioPool) {
    const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL_POOLED (or DATABASE_URL) missing in .env.local");
    g.__offisioPool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });
  }
  return g.__offisioPool;
}
export function directUrl(): string {
  loadEnvLocal();
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL (direct, no -pooler) missing in .env.local");
  return u;
}
