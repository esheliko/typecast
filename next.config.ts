import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Keep visited pages in the client router cache so switching tabs is instant.
  // Server actions call revalidatePath(), which clears this cache after edits.
  experimental: { staleTimes: { dynamic: 300, static: 300 } },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
export default config;
