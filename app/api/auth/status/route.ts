// Polled by the sign-in card: pending -> awaiting_yes (code received, waiting for
// the owner's YES) -> signed_in. When the owner's WhatsApp YES has confirmed
// this browser's code: the row is consumed, the nonce cookie cleared and the
// signed session cookie set. The response never contains the wa_id.
import { cookies } from "next/headers";
import { ownerEpoch, takeLogin } from "@/lib/db/auth";
import { cookieOptions, currentOwner, LOGIN_COOKIE, maskWaId, OWNER_COOKIE, OWNER_MAX_AGE, signOwnerToken } from "@/lib/owner";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const jar = await cookies();
  const nonce = jar.get(LOGIN_COOKIE)?.value;
  if (!nonce) {
    const owner = await currentOwner();
    return Response.json(owner ? { status: "signed_in", phone: maskWaId(owner.waId) } : { status: "none" }, NO_STORE);
  }
  const login = await takeLogin(nonce);
  if (login.state === "pending" || login.state === "awaiting_yes") return Response.json({ status: login.state }, NO_STORE);
  jar.delete(LOGIN_COOKIE);
  if (login.state === "expired") return Response.json({ status: "expired" }, NO_STORE);
  jar.set(OWNER_COOKIE, signOwnerToken(login.waId, await ownerEpoch(login.waId)), cookieOptions(OWNER_MAX_AGE));
  return Response.json({ status: "signed_in", phone: maskWaId(login.waId) }, NO_STORE);
}
