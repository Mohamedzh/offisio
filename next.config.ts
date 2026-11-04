import type { NextConfig } from "next";

// ffmpeg-static binary for routes that convert audio (lib/audio.ts).
const FFMPEG_TRACE = [
  "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
  // local Windows only; deploy via Vercel remote builds so the Linux binary is installed
  "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg.exe",
];

// Blob hosts media may load from: our own store (id from BLOB_READ_WRITE_TOKEN =
// vercel_blob_rw_<storeId>_<secret>, same rule as lib/blob blobStoreHost) and the store
// holding the demo snapshot + sample walkthrough (seeded units point there even in local media mode).
const BLOB_SUFFIX = ".public.blob.vercel-storage.com";
const hostOf = (url: string | undefined) => { try { return url ? new URL(url).hostname.toLowerCase() : null; } catch { return null; } };
const tokenStore = process.env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
const BLOB_HOSTS = [...new Set([
  tokenStore && /^[A-Za-z0-9]{1,64}$/.test(tokenStore) ? `${tokenStore.toLowerCase()}${BLOB_SUFFIX}` : null,
  hostOf(process.env.NEXT_PUBLIC_SAMPLE_VIDEO_URL) ?? `tadysmzbjdkmgzem${BLOB_SUFFIX}`,
].filter((h): h is string => !!h && h.endsWith(BLOB_SUFFIX)))];
const BLOB_SRC = BLOB_HOSTS.map((h) => `https://${h}`).join(" ");

// CSP without nonces (pages are statically prerendered with cacheComponents; a nonce would force
// dynamic rendering), per node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
// Inline scripts are Next's own bootstrap; 'unsafe-eval' only in dev (React debug stacks).
// Third-party origins: Blob store (images, video, sample-video fetch), https://vercel.com
// (@vercel/blob client upload PUTs to vercel.com/api/blob). Google Maps, wa.me and XPay are
// links/redirects only (navigation is not restricted by this policy); next/font is self-hosted.
const isDev = process.env.NODE_ENV === "development";
// Vercel preview deployments inject the Vercel toolbar (vercel.live); allowed on previews only.
const preview = process.env.VERCEL_ENV === "preview";
const LIVE = preview ? " https://vercel.live" : "";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${LIVE}`,
  `style-src 'self' 'unsafe-inline'${LIVE}`,
  `img-src 'self' blob: data: ${BLOB_SRC}${preview ? " https://vercel.live https://vercel.com" : ""}`,
  `media-src 'self' blob: ${BLOB_SRC}`,
  `connect-src 'self' https://vercel.com ${BLOB_SRC}${preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `font-src 'self'${preview ? " https://vercel.live https://assets.vercel.com" : ""}`,
  `frame-src ${preview ? "https://vercel.live" : "'none'"}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Local `pnpm start` runs on http://localhost: upgrading there would break every request.
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Web chat mic and near-me location are same-origin only; no camera anywhere.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: BLOB_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
  cacheComponents: true,
  // WhatsApp voice notes and the web mic: audio -> WAV via the ffmpeg binary (lib/audio.ts).
  // Keep the package unbundled so its __dirname binary path stays valid, and
  // trace the binary into both functions (pnpm keeps it under .pnpm).
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": FFMPEG_TRACE,
    "/api/chat/voice": FFMPEG_TRACE,
  },
  partialPrefetching: true,
  // Local media fallback files (public/uploads, lib/blob): never content-sniffed.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/uploads/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
