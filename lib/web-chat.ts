// Shared by the web chat routes (/api/chat typed text, /api/chat/voice).
// Session id rules, the per-session and per-IP chat caps, and the agent turn
// with its response shape live here so both routes stay identical.
import { randomUUID } from "node:crypto";
import { chatTurn, sessionTurns } from "@/lib/agent/agent";
import { CAPS, deny, limit } from "@/lib/guard";
import type { LatLng } from "@/lib/geo";

// Web sessions are server-issued random UUIDs (returned as session_id, sent back by ChatBox).
// Anything else (a "wa_" WhatsApp key, a script's "acceptance-" key, a guess) starts a new session.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function webSession(id: unknown): string {
  return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : randomUUID();
}

// Session length + per-IP chat limit. Returns a deny Response, or null when the turn may run.
export async function chatGate(session: string, req: Request): Promise<Response | null> {
  if ((await sessionTurns(session)) >= CAPS.sessionTurns) return deny("SESSION_FULL");
  const allowed = await limit("chat", req);
  return allowed.ok ? null : deny(allowed.code);
}

// One agent turn on the web channel; `extra` adds fields (e.g. the voice transcript).
// location: a near-me point already checked and rounded (lib/geo renterLocation).
export async function webTurn(session: string, message: string, locale: unknown, extra: Record<string, unknown> = {}, location?: LatLng): Promise<Response> {
  try {
    const out = await chatTurn(session, message, "chat", undefined, locale === "en" ? "en" : "ar", location);
    return Response.json({ session_id: session, ...extra, ...out });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
