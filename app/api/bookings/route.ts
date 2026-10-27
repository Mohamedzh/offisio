import { createBooking, attachCafeUrl } from "@/lib/booking";
import { getBooking } from "@/lib/db/store";
export async function POST(req: Request) {
  try {
    const booking = await createBooking(await req.json());
    return Response.json({ booking }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const booking = await getBooking(id);
  return booking ? Response.json({ booking: attachCafeUrl(booking) }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
}
