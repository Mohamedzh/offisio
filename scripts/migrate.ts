// Apply lib/db/schema.sql using the DIRECT connection (DATABASE_URL, no -pooler).
// Run: pnpm migrate
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { directUrl } from "../lib/db/pg";

async function main() {
  const client = new Client({ connectionString: directUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(readFileSync("lib/db/schema.sql", "utf8"));
    const t = await client.query<{ count: string }>("select count(*)::text as count from information_schema.tables where table_schema = 'public'");
    console.log(`migration ok — public tables: ${t.rows[0].count}`);
  } finally { await client.end(); }
}
main().catch((e) => { console.error("FAIL", (e as Error).message); process.exit(1); });
