import type { NextConfig } from "next";

// Identifies this deployment. Baked into the client and served by /api/version so open tabs can tell when a newer one is live.
const BUILD_ID = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

const config: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
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
