import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  cacheComponents: true,
  // WhatsApp voice notes: OGG/Opus -> WAV via the ffmpeg binary (lib/audio.ts).
  // Keep the package unbundled so its __dirname binary path stays valid, and
  // trace the binary into the webhook function (pnpm keeps it under .pnpm).
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": [
      "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg",
      // local Windows only; deploy via Vercel remote builds so the Linux binary is installed
      "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg.exe",
    ],
  },
  partialPrefetching: true,
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
