import { chatTurn, sessionTurns } from "@/lib/agent/agent";
import { CAPS, deny, limit } from "@/lib/guard";

export async function POST(req: Request) {
  const { session_id, message } = await req.json() as { session_id?: string; message: string };
  if (!message?.trim()) return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  if (message.length > CAPS.chatChars) return deny("MESSAGE_TOO_LONG", 400);
  const session = typeof session_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(session_id) ? session_id : Math.random().toString(36).slice(2, 10);
  if ((await sessionTurns(session)) >= CAPS.sessionTurns) return deny("SESSION_FULL");
  const allowed = await limit("chat", req);
  if (!allowed.ok) return deny(allowed.code);
  try {
    const out = await chatTurn(session, message);
    return Response.json({ session_id: session, ...out });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
