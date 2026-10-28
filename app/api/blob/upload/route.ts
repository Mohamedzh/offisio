// Browser -> Vercel Blob direct uploads (avoids the 4.5 MB serverless body limit).
// Only issues client tokens; files never pass through this route.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const IMAGE_TYPES = ["image/jpeg"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm"];
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
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
        return {
          allowedContentTypes: isVideo ? VIDEO_TYPES : IMAGE_TYPES,
          maximumSizeInBytes: isVideo ? MAX_VIDEO : MAX_IMAGE,
          addRandomSuffix: false,
          allowOverwrite: true,
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
