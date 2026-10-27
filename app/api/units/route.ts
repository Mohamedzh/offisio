import { listUnits, getUnit } from "@/lib/db/store";
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  const units = slug ? [await getUnit(slug)].filter(Boolean) : await listUnits();
  return Response.json({ units });
}
