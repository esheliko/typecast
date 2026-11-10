import { defineConfig } from "@playwright/test";

/**
 * Smoke tests: sign in as a dedicated test user and load every main page against a real build (`npm run build && npm run smoke`).
 * Needs SMOKE_EMAIL / SMOKE_PASSWORD (a dedicated account, never a real one) plus the usual Supabase and TMDB env.
 * Set SMOKE_BASE_URL to test an already-running site instead of starting `next start`.
 */
const base = process.env.SMOKE_BASE_URL;
export default defineConfig({
  testDir: "tests/smoke",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // behaviour + smoke write to ONE shared test user, so they never run side by side
  // `core` (behaviour + smoke, mutates the test user) and `visual` (only reads pages) can be run as two concurrent invocations in CI:
  // `--project=core` and `--project=visual` with SMOKE_SKIP_SETUP=1 on the second. Plain `npm run smoke` runs both, one after the other.
  projects: [
    { name: "core", testIgnore: /visual\.spec\.ts/, outputDir: "test-results/core" },
    { name: "visual", testMatch: /visual\.spec\.ts/, outputDir: "test-results/visual" },
  ],
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: base ?? "http://localhost:3100",
    trace: "off",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ["--no-sandbox"] } : {},
  },
  globalSetup: "./tests/smoke/global-setup.ts",
  globalTeardown: "./tests/smoke/global-teardown.ts",
  webServer: base ? undefined : { command: "npm run start -- -p 3100", url: "http://localhost:3100/login", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
