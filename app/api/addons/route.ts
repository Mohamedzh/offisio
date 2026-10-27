import { ADDON_CATALOG, CAFE } from "@/lib/addons/catalog";
export async function GET() {
  return Response.json({ cafe: CAFE.name, whatsapp_configured: Boolean(CAFE.whatsapp()), items: ADDON_CATALOG });
}
