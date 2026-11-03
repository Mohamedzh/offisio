// Postgres pool. App runtime uses the POOLED string (Neon PgBouncer,
// serverless traffic); migrations use the DIRECT string (scripts/migrate.ts).
// A local Postgres (docker-compose.yml) works with the same string in both.
import { Pool } from "pg";
import { loadEnvLocal } from "../meta/client";

loadEnvLocal();

// SSL from the URL: none for localhost or sslmode=disable (local docker
// Postgres has no TLS); otherwise TLS as before (Neon).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
// Host is this machine (scripts/seed.ts uses it as its safety check). False on parse error.
export function isLocalDb(connectionString: string): boolean {
  try { return LOCAL_HOSTS.has(new URL(connectionString).hostname); } catch { return false; }
}
function sslDisabled(connectionString: string): boolean {
  try { return new URL(connectionString).searchParams.get("sslmode") === "disable"; } catch { return false; }
}
export function sslFor(connectionString: string): false | { rejectUnauthorized: false } {
  return isLocalDb(connectionString) || sslDisabled(connectionString) ? false : { rejectUnauthorized: false };
}

const g = globalThis as unknown as { __offisioPool?: Pool };
export function pool(): Pool {
  if (!g.__offisioPool) {
    // || not ??: a copied .env.example leaves DATABASE_URL_POOLED empty.
    const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL_POOLED (or DATABASE_URL) missing in .env.local");
    g.__offisioPool = new Pool({ connectionString, ssl: sslFor(connectionString), max: 5 });
  }
  return g.__offisioPool;
}
export function directUrl(): string {
  loadEnvLocal();
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL (direct, no -pooler) missing in .env.local");
  return u;
}
