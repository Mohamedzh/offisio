import { availabilityByDay } from "@/lib/db/store";
export async function GET(req: Request) {
  const unit = new URL(req.url).searchParams.get("unit") ?? "";
  return Response.json({ days: await availabilityByDay(unit) });
}
