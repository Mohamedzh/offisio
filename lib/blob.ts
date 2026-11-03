// Vercel Blob storage helpers. Server-side only (uses BLOB_READ_WRITE_TOKEN).
// media.url stores the returned public URL; no schema change needed.
// Local media fallback (plan/07 7.1): with no BLOB_READ_WRITE_TOKEN and not on
// Vercel, files go to gitignored public/uploads/<slug>/... and are served by Next
// from /uploads/<slug>/...; never active on Vercel.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

export const localMediaMode = (): boolean => !process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL;

const LOCAL_ROOT = () => path.join(process.cwd(), "public", "uploads");
const SEG = "[A-Za-z0-9_-]{1,64}"; const FILE = "[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}";
// Local URL: /uploads/<slug>/<file> or /uploads/<slug>/staged/<file>; nothing else.
const LOCAL_URL_RE = new RegExp(`^/uploads/${SEG}/(staged/)?${FILE}$`);
export const isLocalMediaUrl = (url: string): boolean => localMediaMode() && LOCAL_URL_RE.test(url) && !url.includes("..");

// Storage pathname -> local URL: uploads/<slug>/<file> as is, staged/<slug>/<file> -> uploads/<slug>/staged/<file>.
function localUrlFor(pathname: string): string {
  const up = pathname.match(new RegExp(`^uploads/(${SEG})/(${FILE})$`));
  const st = pathname.match(new RegExp(`^staged/(${SEG})/(${FILE})$`));
  const url = up ? `/uploads/${up[1]}/${up[2]}` : st ? `/uploads/${st[1]}/staged/${st[2]}` : null;
  if (!url || !isLocalMediaUrl(url)) throw new Error("invalid local media pathname");
  return url;
}
/** Disk path of a local media URL (inside public/uploads only), else null. */
export function localDiskPath(url: string): string | null {
  if (!isLocalMediaUrl(url)) return null;
  const root = LOCAL_ROOT(); const p = path.resolve(root, url.slice("/uploads/".length));
  return p.startsWith(root + path.sep) ? p : null;
}
/** Write a local media file; overwrite=false refuses an existing file. Returns the local URL. */
export async function writeLocal(pathname: string, body: Buffer, overwrite: boolean): Promise<string> {
  const url = localUrlFor(pathname); const p = localDiskPath(url);
  if (!p) throw new Error("invalid local media pathname");
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body, { flag: overwrite ? "w" : "wx" });
  return url;
}
/** Where a media URL is read from: a local disk path (fallback mode) or an https URL. Anything else throws BAD_MEDIA_URL. */
export function mediaSource(url: string): string {
  const p = localDiskPath(url);
  if (p) return p;
  if (url.startsWith("https://")) return url;
  throw new Error("BAD_MEDIA_URL");
}
/** Bytes of a media URL: local file in fallback mode, else fetched over https (Blob or provider URL). */
export async function mediaBytes(url: string): Promise<Buffer> {
  const src = mediaSource(url);
  if (!src.startsWith("https://")) return readFile(src);
  const r = await fetch(src);
  if (!r.ok) throw new Error(`fetch media failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Upload bytes publicly at an exact pathname (no random suffix). Returns the Blob URL (local URL in fallback mode). */
export async function putPublic(
  pathname: string,
  body: Buffer | Blob | string,
  contentType?: string,
): Promise<string> {
  if (localMediaMode()) {
    const buf = typeof body === "string" ? Buffer.from(body) : Buffer.isBuffer(body) ? body : Buffer.from(await body.arrayBuffer());
    return writeLocal(pathname, buf, true);
  }
  const res = await put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    ...(contentType ? { contentType } : {}),
  });
  return res.url;
}
