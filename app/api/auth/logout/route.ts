// Sign out: drop the owner session (and any half-finished sign-in).
import { cookies } from "next/headers";
import { LOGIN_COOKIE, OWNER_COOKIE } from "@/lib/owner";

export async function POST(req: Request) {
  // JSON only: a cross-site form post cannot set this content type.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
  const jar = await cookies();
  jar.delete(OWNER_COOKIE);
  jar.delete(LOGIN_COOKIE);
  return Response.json({ ok: true });
}
