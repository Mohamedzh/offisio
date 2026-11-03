import type { NextConfig } from "next";

// ffmpeg-static binary for routes that convert audio (lib/audio.ts).
const FFMPEG_TRACE = [
  "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
  // local Windows only; deploy via Vercel remote builds so the Linux binary is installed
  "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg.exe",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
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
    return [{ source: "/uploads/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] }];
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
