import { test, expect, devices, type Page } from "@playwright/test";
import fs from "node:fs";
import { configured } from "./seed";
import { collect, looksRight } from "./visual";

/**
 * Visual sanity: open every page the way a phone and a laptop would and check it looks right, without pixel baselines (live TMDB data
 * would make those flaky): real content, no sideways scroll, every visible poster loaded, no console errors or CSP violations.
 * It runs against the production build, so the service worker is registered; the signed-in pages are visited AFTER it controls the
 * page, which is how a worker or CSP change that blanks posters (it did, on phones) fails here. Screenshots go to visual-shots/ for a human look.
 */
const PAGES: [string, string][] = [
  ["browse", "/"],
  ["library", "/library"],
  ["stats", "/library/stats"],
  ["settings", "/setup"],
  ["film", "/title/movie/603?full=1"],
  ["series", "/title/tv/1396?full=1"],
  ["person", "/person/6384?full=1"],
  ["film-popup", "/title/movie/603"],
  ["person-popup", "/person/6384"],
];

async function shot(page: Page, name: string) {
  fs.mkdirSync("visual-shots", { recursive: true });
  await page.screenshot({ path: `visual-shots/${name}.png`, fullPage: false }).catch(() => {});
}
async function open(page: Page, path: string) {
  const r = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(r?.status(), `${path} status`).toBeLessThan(400);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

const { viewport: pv, userAgent: pua, deviceScaleFactor: pdsf } = devices["Pixel 7"];
// defaultBrowserType can't be set inside a describe, so only the parts of the phone preset that matter are copied.
for (const [label, device] of [["phone", { viewport: pv, userAgent: pua, deviceScaleFactor: pdsf, isMobile: true, hasTouch: true }], ["laptop", { viewport: { width: 1280, height: 800 } }]] as const) {
  test.describe(`visual ${label}`, () => {
    test.use({ ...device });
    test.setTimeout(150_000);

    test("login and offline pages", async ({ page }) => {
      const bad = collect(page);
      for (const [n, p] of [["login", "/login"], ["offline", "/offline"]]) {
        await open(page, p);
        await looksRight(page, bad, `${label} ${n}`);
        await shot(page, `${label}-${n}`);
      }
    });

    test.describe("signed in", () => {
      test.skip(!configured(), "no SMOKE_EMAIL/SMOKE_PASSWORD: signed-in pages not checked");
      test("every page, with the service worker in control", async ({ page }) => {
        const bad = collect(page);
        await page.goto("/login");
        await page.getByLabel("Email").fill(process.env.SMOKE_EMAIL!);
        await page.getByLabel("Password").fill(process.env.SMOKE_PASSWORD!);
        await page.getByRole("button", { name: "Sign in" }).click();
        await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
        // Let the worker take over, then reload so every request below goes through it (the state real returning users are in).
        await page.waitForFunction(() => "serviceWorker" in navigator && !!navigator.serviceWorker.controller, null, { timeout: 15_000 })
          .catch(async () => { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 }); });
        const failures: string[] = [];
        for (const [name, path] of PAGES) {
          bad.length = 0;
          try {
            await open(page, path);
            await looksRight(page, bad, `${label} ${name} (${path})`);
          } catch (e) { failures.push(String((e as Error).message).split("\n").slice(0, 4).join(" | ")); }
          await shot(page, `${label}-${name}`);
        }
        expect(failures, failures.join("\n")).toEqual([]);
      });
    });
  });
}
