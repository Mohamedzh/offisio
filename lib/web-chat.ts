// Shared by the web chat routes (/api/chat typed text, /api/chat/voice).
// Session id rules, the per-session and per-IP chat caps, and the agent turn
// with its response shape live here so both routes stay identical.
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { chatTurn, sessionTurns } from "@/lib/agent/agent";
import { CAPS, clientKeyFrom, deny, limit, spendBlocked } from "@/lib/guard";
import type { LatLng } from "@/lib/geo";

// Web sessions are server-issued random UUIDs (returned as session_id, sent back by ChatBox).
// Anything else (a "wa_" WhatsApp key, a script's "acceptance-" key, a guess) starts a new session.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function webSession(id: unknown): string {
  return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : randomUUID();
}

// Session length, daily spend ceiling and per-IP chat limit (every turn is a paid model call).
// Returns a deny Response, or null when the turn may run.
export async function chatGate(session: string, req: Request): Promise<Response | null> {
  if ((await sessionTurns(session)) >= CAPS.sessionTurns) return deny("SESSION_FULL");
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit("chat", req);
  return allowed.ok ? null : deny(allowed.code);
}

// One agent turn on the web channel; `extra` adds fields (e.g. the voice transcript).
// location: a near-me point already checked and rounded (lib/geo renterLocation).
export async function webTurn(session: string, message: string, locale: unknown, extra: Record<string, unknown> = {}, location?: LatLng): Promise<Response> {
  try {
    // Booking cap key: the same hashed-IP bucket as /api/bookings (lib/guard limit).
    const bookingKey = `ip:${clientKeyFrom(await headers())}`;
    const out = await chatTurn(session, message, "chat", undefined, locale === "en" ? "en" : "ar", location, bookingKey);
    return Response.json({ session_id: session, ...extra, ...out });
  } catch (e) {
    // Fixed code only: provider/DB error text never reaches the client or the log.
    console.error("[chat] turn failed", (e as Error).name);
    return Response.json({ error: "CHAT_FAILED" }, { status: 502 });
  }
}
