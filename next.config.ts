import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. Next.js emits inline bootstrap scripts, and nonces would need per-request rendering for every page,
// so script-src keeps 'unsafe-inline' (no 'unsafe-eval' in production). The rest is strict: everything is same-origin except
// images (TMDB posters plus arbitrary https thumbnails in the Glimpse panel). The browser only talks to this origin: TMDB and Supabase are server-side.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Keep visited pages in the client router cache so switching tabs is instant.
  // Bulk/settings actions call revalidatePath(), which clears this cache; quick marks do not (LibProvider refreshes once on the next navigation).
  experimental: { staleTimes: { dynamic: 300, static: 300 } },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
export default config;
