// Serves runtime-uploaded keyframes. Files written into public/ after the
// production server starts are not served statically, so this handler reads
// them from disk. Slug/file are strictly validated (no path traversal).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(slug) || !/^frame-\d+\.jpg$/.test(file))
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const data = await readFile(join(process.cwd(), "public", "uploads", slug, file));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
