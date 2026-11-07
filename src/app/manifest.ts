import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Typecast", short_name: "Typecast",
    description: "Find out where you know actors from, track what you watch, and see where to stream it.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#0f1116", theme_color: "#0f1116", categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
