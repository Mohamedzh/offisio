import { CAPS, deny } from "@/lib/guard";
import { renterLocation, type LatLng } from "@/lib/geo";
import { chatGate, webSession, webTurn } from "@/lib/web-chat";

// Optional `location` ({lat, lng} from the 📍 button): checked and rounded here, before any
// limit or paid call, and never logged. A location turn may have an empty message.
export async function POST(req: Request) {
  // Bad or non-object JSON is a client error with a fixed code, never a 500.
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  const { session_id, message, locale, location } = body as { session_id?: string; message?: string; locale?: string; location?: unknown };
  let loc: LatLng | undefined;
  if (location !== undefined && location !== null) {
    const v = renterLocation(location);
    if (!v.ok) return Response.json({ error: v.code }, { status: 400 });
    loc = v.loc;
  }
  const text = typeof message === "string" ? message : "";
  if (!text.trim() && !loc) return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  if (text.length > CAPS.chatChars) return deny("MESSAGE_TOO_LONG", 400);
  const session = webSession(session_id);
  const denied = await chatGate(session, req);
  if (denied) return denied;
  return webTurn(session, text, locale, {}, loc);
}
