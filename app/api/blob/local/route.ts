// Local media fallback (plan/07 7.1): the browser PUTs frames and the video here
// instead of to Vercel Blob when BLOB_READ_WRITE_TOKEN is unset and not on Vercel.
// Same rules as /api/blob/upload: uploads/<slug>/<file> with the client's own file
// names only, size caps, new slugs only, no overwrite, same limits. 404 whenever the fallback is off.
import { localMediaMode, writeLocal } from "@/lib/blob";
import { unitId } from "@/lib/db/store";
import { CAPS, deny, limit, spendBlocked } from "@/lib/guard";
import { currentOwner, issueGuest } from "@/lib/owner";
import { UPLOAD_PATH_RE } from "@/lib/upload-names";

const VIDEO_TYPE: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
const bad = (error: string, status = 400) => Response.json({ error }, { status });

// Reads at most `max` bytes; null as soon as the stream goes over.
async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<Buffer | null> {
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function PUT(req: Request): Promise<Response> {
  if (!localMediaMode()) return bad("NOT_FOUND", 404);
  const pathname = new URL(req.url).searchParams.get("pathname") ?? "";
  const m = pathname.match(UPLOAD_PATH_RE);
  if (!m) return bad("invalid pathname");
  const ext = m[2].endsWith(".jpg") ? null : m[2].slice("source.".length);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== (ext ? VIDEO_TYPE[ext] : "image/jpeg")) return bad("content type not allowed");
  const max = ext ? CAPS.videoBytes : CAPS.frameBytes;
  const lenHeader = req.headers.get("content-length");
  if (!lenHeader || !/^\d+$/.test(lenHeader)) return bad("LENGTH_REQUIRED", 411);
  if (Number(lenHeader) > max) return bad("file too large", 413);

  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const allowed = await limit("blob_token", req);
  if (!allowed.ok) return deny(allowed.code);
  if (ext) { const v = await limit("blob_video", req); if (!v.ok) return deny(v.code); }
  if (!(await currentOwner())) await issueGuest();
  // Existing units (seeded, generated, or already uploaded) are never writable from here.
  if (await unitId(m[1])) return bad("slug already exists");

  const body = req.body ? await readCapped(req.body, max) : Buffer.alloc(0);
  if (!body) return bad("file too large", 413);
  if (!body.length) return bad("empty file");
  try {
    return Response.json({ url: await writeLocal(pathname, body, false) });
  } catch (e) {
    return bad((e as NodeJS.ErrnoException).code === "EEXIST" ? "file already exists" : "write failed");
  }
}
