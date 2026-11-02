import { randomUUID } from "node:crypto";
import { chatTurn, sessionTurns } from "@/lib/agent/agent";
import { CAPS, deny, limit } from "@/lib/guard";

export async function POST(req: Request) {
  const { session_id, message, locale } = await req.json() as { session_id?: string; message: string; locale?: string };
  if (!message?.trim()) return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  if (message.length > CAPS.chatChars) return deny("MESSAGE_TOO_LONG", 400);
  // Web sessions are random UUIDs; "wa_" keys belong to WhatsApp senders and never resume here.
  const session = typeof session_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(session_id) && !session_id.startsWith("wa_") ? session_id : randomUUID();
  if ((await sessionTurns(session)) >= CAPS.sessionTurns) return deny("SESSION_FULL");
  const allowed = await limit("chat", req);
  if (!allowed.ok) return deny(allowed.code);
  try {
    const out = await chatTurn(session, message, "chat", undefined, locale === "en" ? "en" : "ar");
    return Response.json({ session_id: session, ...out });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
