import { chatTurn } from "@/lib/agent/agent";
export async function POST(req: Request) {
  const { session_id, message } = await req.json() as { session_id?: string; message: string };
  if (!message?.trim()) return Response.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
  const session = session_id || Math.random().toString(36).slice(2, 10);
  try {
    const out = await chatTurn(session, message);
    return Response.json({ session_id: session, ...out });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
