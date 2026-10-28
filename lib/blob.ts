// Vercel Blob storage helpers. Server-side only (uses BLOB_READ_WRITE_TOKEN).
// media.url stores the returned public URL; no schema change needed.
import { put } from "@vercel/blob";

export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** Upload bytes publicly at an exact pathname (no random suffix). Returns the Blob URL. */
export async function putPublic(
  pathname: string,
  body: Buffer | Blob | string,
  contentType?: string,
): Promise<string> {
  const res = await put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    ...(contentType ? { contentType } : {}),
  });
  return res.url;
}
