// "Your listing is ready" link from WhatsApp (plan/08 8.1 step 5). A valid, unexpired,
// first-use token for a draft that is still ready (or already published) sets this
// browser's guest cookie (the draft's guest id) and an owner session for the WhatsApp
// sender stored on the draft (current epoch, same as a normal sign-in), then 303s to the
// draft page (review panel, specs edit, Publish). Any failure -> the login page, no detail.
// The token holds no PII: the owner's wa_id comes from the draft row.
import { cookies } from "next/headers";
import { ownerEpoch, unitOwnerWaId } from "@/lib/db/auth";
import { draftBySlug } from "@/lib/db/wa-drafts";
import { firstSeen } from "@/lib/guard";
import { cookieOptions, GUEST_COOKIE, GUEST_MAX_AGE, OWNER_COOKIE, OWNER_MAX_AGE, signGuestToken, signOwnerToken } from "@/lib/owner";
import { verifyWaLink } from "@/lib/wa-link";

const see = (path: string, req: Request) => new Response(null, { status: 303, headers: { Location: new URL(path, req.url).toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
// Link-preview crawlers must not burn the single use (WhatsApp messages are sent without previews too).
const PREVIEW_BOT = /facebookexternalhit|whatsapp|meta-externalagent|twitterbot|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|bingpreview|googlebot/i;

export async function GET(req: Request) {
  const claims = verifyWaLink(new URL(req.url).searchParams.get("t"));
  const lang = claims?.lang ?? "en";
  const fail = () => see(`/${lang}/login`, req);
  if (!claims || PREVIEW_BOT.test(req.headers.get("user-agent") ?? "")) return fail();
  // A cancelled or expired draft's links stop working.
  const draft = await draftBySlug(claims.slug);
  if (!draft || draft.guest_id !== claims.gid || (draft.status !== "ready" && draft.status !== "published")) return fail();
  // The unit must still be this draft (guest id) or already owned by the draft's sender.
  const unit = await unitOwnerWaId(claims.slug);
  if (!unit || (unit.guest_owner !== draft.guest_id && unit.owner_wa_id !== draft.wa_id)) return fail();
  if (!(await firstSeen("wa_link_token", claims.jti))) return fail();
  const jar = await cookies();
  jar.set(GUEST_COOKIE, signGuestToken(draft.guest_id), cookieOptions(GUEST_MAX_AGE));
  jar.set(OWNER_COOKIE, signOwnerToken(draft.wa_id, await ownerEpoch(draft.wa_id)), cookieOptions(OWNER_MAX_AGE));
  return see(`/${lang}/units/${claims.slug}`, req);
}
