import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Offisio — أوفيسيو",
    short_name: "Offisio",
    description: "Turn any office into a bookable, furnished-looking listing from a short video.",
    start_url: "/",
    display: "standalone",
    background_color: "#D8D3C6",
    theme_color: "#D8D3C6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
