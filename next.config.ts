import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Keep visited pages in the client router cache so switching tabs is instant.
  // Bulk/settings actions call revalidatePath(), which clears this cache; quick marks do not (LibProvider refreshes once on the next navigation).
  experimental: { staleTimes: { dynamic: 300, static: 300 } },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
export default config;
