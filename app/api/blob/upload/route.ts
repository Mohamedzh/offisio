// Browser -> Vercel Blob direct uploads (avoids the 4.5 MB serverless body limit).
// Only issues client tokens; files never pass through this route.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { unitId } from "@/lib/db/store";
import { CAPS, deny, limit } from "@/lib/guard";

const IMAGE_TYPES = ["image/jpeg"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm"];
const MAX_IMAGE = CAPS.frameBytes;
const MAX_VIDEO = CAPS.videoBytes;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  // Rate-limit every token/URL request; only Vercel's upload-completed callback is exempt.
  if (body.type !== "blob.upload-completed") {
    const allowed = await limit("blob_token", request);
    if (!allowed.ok) return deny(allowed.code);
  }
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // uploads/<slug>/<file> only — slug is client-generated, no traversal.
        if (!/^uploads\/[A-Za-z0-9_-]{1,64}\/[^/]+$/.test(pathname))
          throw new Error("invalid pathname");
        const isVideo = VIDEO_EXTS.some((e) => pathname.toLowerCase().endsWith(e));
        if (!isVideo && !pathname.toLowerCase().endsWith(".jpg"))
          throw new Error("only .jpg frames or video files are allowed");
        // Existing units (seeded, generated, or already uploaded) are never writable from here.
        if (await unitId(pathname.split("/")[1])) throw new Error("slug already exists");
        return {
          allowedContentTypes: isVideo ? VIDEO_TYPES : IMAGE_TYPES,
          maximumSizeInBytes: isVideo ? MAX_VIDEO : MAX_IMAGE,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
      onUploadCompleted: async () => {
        // Media rows are written by /api/units/upload from the URL list.
      },
    });
    return Response.json(jsonResponse);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
