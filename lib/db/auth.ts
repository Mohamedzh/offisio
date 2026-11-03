// Owner sign-in rows (login_codes) and unit ownership. wa_id is PII: it is
// stored here and in units.owner_wa_id only, never logged or returned to a browser.
import { pool } from "./pg";

export const LOGIN_TTL_MIN = 10;
export const YES_WINDOW_MIN = 2; // YES must follow the code message within this

export async function insertLoginCode(code: string, browserNonce: string): Promise<void> {
  // Opportunistic cleanup: rows older than a day are never usable.
  await pool().query("delete from login_codes where created_at < now() - interval '1 day'");
  await pool().query("insert into login_codes (code, browser_nonce) values ($1, $2)", [code, browserNonce]);
}

type Q = (sql: string, args: unknown[]) => Promise<{ rowCount: number | null }>;
async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn((sql, args) => client.query(sql, args));
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally { client.release(); }
}

// Webhook step 1: the code arrived from waId. True when it was fresh, unconfirmed and
// not already claimed by another sender; the row then waits for that sender's YES.
// Only one code per sender awaits YES: the sender's other unconfirmed rows stop waiting.
export async function markLoginPending(code: string, waId: string): Promise<boolean> {
  return tx(async (q) => {
    const { rowCount } = await q(
      `update login_codes set wa_id = $2, pending_at = now()
       where code = $1 and confirmed_at is null and (wa_id is null or wa_id = $2)
         and created_at > now() - make_interval(mins => $3)`,
      [code, waId, LOGIN_TTL_MIN]);
    if (rowCount !== 1) return false;
    await q("update login_codes set pending_at = null where wa_id = $1 and code <> $2 and confirmed_at is null", [waId, code]);
    return true;
  });
}
// The YES warning could not be delivered: this code must not be confirmable.
export async function clearLoginPending(code: string): Promise<void> {
  await pool().query("update login_codes set pending_at = null where code = $1 and confirmed_at is null", [code]);
}
const PENDING_FOR = `wa_id = $1 and confirmed_at is null and pending_at > now() - make_interval(mins => ${YES_WINDOW_MIN})
  and created_at > now() - make_interval(mins => ${LOGIN_TTL_MIN})`;
export async function hasPendingYes(waId: string): Promise<boolean> {
  const { rowCount } = await pool().query(`select 1 from login_codes where ${PENDING_FOR} limit 1`, [waId]);
  return !!rowCount;
}
// Webhook step 2: YES from the same sender confirms their latest pending code only.
export async function confirmPendingYes(waId: string): Promise<boolean> {
  const { rowCount } = await pool().query(
    `update login_codes set confirmed_at = now()
     where confirmed_at is null and code = (select code from login_codes where ${PENDING_FOR} order by pending_at desc limit 1)`, [waId]);
  return rowCount === 1;
}

// Remote sign-out: sessions carry the epoch they were issued at; "Offisio logout" bumps it.
export async function ownerEpoch(waId: string): Promise<number> {
  const { rows } = await pool().query<{ epoch: number }>("select epoch from owner_epochs where wa_id = $1", [waId]);
  return rows[0]?.epoch ?? 0;
}
// Also drops this sender's in-flight sign-ins (pending, or confirmed but not yet taken).
export async function bumpOwnerEpoch(waId: string): Promise<void> {
  await tx(async (q) => {
    await q("insert into owner_epochs (wa_id, epoch) values ($1, 1) on conflict (wa_id) do update set epoch = owner_epochs.epoch + 1", [waId]);
    await q("delete from login_codes where wa_id = $1", [waId]);
  });
}

export type LoginState = { state: "pending" } | { state: "awaiting_yes" } | { state: "expired" } | { state: "confirmed"; waId: string };
// Browser side: a confirmed row is deleted as it is read (single use).
export async function takeLogin(browserNonce: string): Promise<LoginState> {
  const taken = await pool().query<{ wa_id: string }>(
    `delete from login_codes where browser_nonce = $1 and wa_id is not null
     and confirmed_at > now() - make_interval(mins => $2) returning wa_id`, [browserNonce, LOGIN_TTL_MIN]);
  if (taken.rows[0]) return { state: "confirmed", waId: taken.rows[0].wa_id };
  const { rows } = await pool().query<{ fresh: boolean; pending: boolean | null; claimed: boolean }>(
    `select created_at > now() - make_interval(mins => $2) as fresh,
            pending_at > now() - make_interval(mins => $3) as pending, wa_id is not null as claimed
     from login_codes where browser_nonce = $1`, [browserNonce, LOGIN_TTL_MIN, YES_WINDOW_MIN]);
  const r = rows[0];
  // Expired: too old, YES window lapsed, or cleared (a newer code from the sender, or a failed warning).
  if (!r?.fresh || r.pending === false || (r.claimed && r.pending === null)) return { state: "expired" };
  return r.pending ? { state: "awaiting_yes" } : { state: "pending" };
}

// guest_owner: the uploading browser's random id while the unit is a draft (not PII).
export async function unitOwnerWaId(slug: string): Promise<{ owner_wa_id: string | null; guest_owner: string | null } | null> {
  const { rows } = await pool().query<{ owner_wa_id: string | null; guest_owner: string | null }>(
    "select owner_wa_id, guest_owner from units where slug = $1", [slug]);
  return rows[0] ?? null;
}
// Publish a guest draft: only while it is still a draft held by this guest id.
// Signed in: owner_wa_id = the owner's wa_id and guest_owner is cleared.
// waId null = local mock publish (WhatsApp not configured, never on Vercel): owner_wa_id is
// the non-numeric sentinel 'local-demo' (no number to message or mask; it can never match a
// signed-in owner because verifyOwnerToken requires digits) and guest_owner is kept, so the
// uploading browser can still edit it.
export const LOCAL_DEMO_OWNER = "local-demo";
// Returns the unit's pipeline status ('processing' | 'ready' | 'failed'), or null when nothing was published.
export async function publishDraft(slug: string, guestId: string, waId: string | null): Promise<string | null> {
  // Same rule as lib/owner publishMockAllowed (not imported: lib/owner imports this module).
  if (waId === null && (process.env.WHATSAPP_TOKEN || process.env.VERCEL)) throw new Error("MOCK_PUBLISH_NOT_ALLOWED");
  const { rows } = await pool().query<{ status: string }>(
    `update units set owner_wa_id = coalesce($3::text, $4::text), guest_owner = case when $3::text is null then guest_owner else null end
     where slug = $1 and guest_owner = $2 and owner_wa_id is null returning status`, [slug, guestId, waId, LOCAL_DEMO_OWNER]);
  return rows[0]?.status ?? null;
}
