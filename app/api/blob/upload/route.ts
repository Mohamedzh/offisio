// Browser -> Vercel Blob direct uploads (avoids the 4.5 MB serverless body limit).
// Only issues client tokens; files never pass through this route.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { unitId } from "@/lib/db/store";
import { CAPS, deny, limit, spendBlocked } from "@/lib/guard";
import { currentOwner, issueGuest } from "@/lib/owner";
import { UPLOAD_PATH_RE } from "@/lib/upload-names";

const IMAGE_TYPES = ["image/jpeg"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm"];
const MAX_IMAGE = CAPS.frameBytes;
const MAX_VIDEO = CAPS.videoBytes;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  // Rate-limit every token/URL request; only Vercel's upload-completed callback is exempt.
  if (body.type !== "blob.upload-completed") {
    // Signed-in owners, or guests (the upload becomes a private draft; lib/owner).
    if (await spendBlocked()) return deny("DEMO_QUOTA");
    const allowed = await limit("blob_token", request);
    if (!allowed.ok) return deny(allowed.code);
    // Video tokens (up to 80 MB each) have their own tight bucket.
    const pathname = body.type === "blob.generate-client-token" ? String(body.payload?.pathname ?? "").toLowerCase() : "";
    if (VIDEO_EXTS.some((e) => pathname.endsWith(e))) {
      const video = await limit("blob_video", request);
      if (!video.ok) return deny(video.code);
    }
    if (!(await currentOwner())) await issueGuest();
  }
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // uploads/<slug>/(frame-<i>.jpg|source.<ext>) only (lib/upload-names) — slug is client-generated, no traversal.
        if (!UPLOAD_PATH_RE.test(pathname)) throw new Error("invalid pathname");
        const isVideo = VIDEO_EXTS.some((e) => pathname.endsWith(e));
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
