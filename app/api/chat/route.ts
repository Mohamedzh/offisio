import { CAPS, deny } from "@/lib/guard";
import { chatGate, webSession, webTurn } from "@/lib/web-chat";

export async function POST(req: Request) {
  const { session_id, message, locale } = await req.json() as { session_id?: string; message: string; locale?: string };
  if (!message?.trim()) return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  if (message.length > CAPS.chatChars) return deny("MESSAGE_TOO_LONG", 400);
  const session = webSession(session_id);
  const denied = await chatGate(session, req);
  if (denied) return denied;
  return webTurn(session, message, locale);
}
