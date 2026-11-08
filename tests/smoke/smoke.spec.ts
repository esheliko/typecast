import { test, expect, type Page } from "@playwright/test";
import { configured } from "./seed";

/** Errors that mean a page is broken. Image 404s and the like are not. */
const BROKEN = /Server Components render|Attempted to call|Hydration failed|Minified React error|Application error|Unhandled/i;

function watch(page: Page) {
  const bad: string[] = [];
  page.on("pageerror", (e) => bad.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && BROKEN.test(m.text())) bad.push(`console: ${m.text().slice(0, 300)}`); });
  return bad;
}

/** The page rendered its content: no error screen, no 5xx, no client or server render errors. */
async function healthy(page: Page, bad: string[]) {
  await expect(page.getByText("Something went wrong on our side")).toHaveCount(0);
  await expect(page.getByText(/Could not load your library|Suggestions unavailable/)).toHaveCount(0);
  expect(bad, bad.join("\n")).toEqual([]);
}

async function visit(page: Page, path: string, bad: string[]) {
  const r = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(r?.status(), `${path} status`).toBeLessThan(400);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await healthy(page, bad);
}

test.describe("signed out", () => {
  test("login page renders", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/login", bad);
    await expect(page.getByLabel("Email")).toBeVisible();
  });
  test("private pages redirect to login", async ({ page }) => {
    for (const p of ["/library", "/setup", "/"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/login/);
    }
  });
  test("API answers 401 JSON, not a crash", async ({ request }) => {
    const r = await request.get("/api/search?q=matrix");
    expect(r.status()).toBe(401);
    expect(await r.json()).toHaveProperty("error");
  });
});

test.describe("signed in", () => {
  test.skip(!configured(), "no SMOKE_EMAIL/SMOKE_PASSWORD: authenticated pages not tested");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.SMOKE_EMAIL!);
    await page.getByLabel("Password").fill(process.env.SMOKE_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  });

  test("Browse", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/", bad);
    await expect(page.getByRole("link", { name: "Library" }).first()).toBeVisible();
  });

  test("Library shows the seeded titles, with every filter and sort", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/library", bad);
    await expect(page.getByText("The Matrix").first()).toBeVisible();
    await expect(page.getByText("Breaking Bad").first()).toBeVisible();
    // The server page reads these params and the client view applies them: this is the path that crashed in production.
    for (const q of ["f=watched", "f=watching", "f=watchlist", "f=partial", "s=title", "s=year", "s=yearOld", "s=rating", "s=watched", "f=watched&s=rating", "s=bogus"]) {
      await visit(page, `/library?${q}`, bad);
      await expect(page.getByText("The Matrix").or(page.getByText("Breaking Bad")).first()).toBeVisible();
    }
  });

  test("tabs navigate softly to the Library", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/", bad);
    await page.getByRole("link", { name: "Library" }).first().click();
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByText("The Matrix").first()).toBeVisible({ timeout: 20_000 });
    await healthy(page, bad);
  });

  test("Settings", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/setup", bad);
  });

  // A hard load of /title/... restores the popup over Browse; ?full=1 is the standalone page ("Open full page").
  test("title page (full page)", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/title/movie/603?full=1", bad);
    await expect(page.getByRole("heading", { name: /The Matrix/ })).toBeVisible({ timeout: 20_000 });
    await visit(page, "/title/tv/1396?full=1", bad);
    await expect(page.getByRole("heading", { name: /Breaking Bad/ })).toBeVisible({ timeout: 20_000 });
  });

  test("title popup (hard load restores it over Browse)", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/title/movie/603", bad);
    try {
      await expect(page.getByRole("heading", { name: /The Matrix/ })).toBeVisible({ timeout: 20_000 });
    } catch (e) {
      // Say what the page actually shows: CI has no screenshots, and this decides "test bug" vs "popup bug".
      const text = (await page.locator("body").innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 600);
      const dialogs = await page.locator('[role="dialog"], dialog').count();
      throw new Error(`Title popup never showed "The Matrix". url=${page.url()} dialogs=${dialogs} bad=[${bad.join(" | ")}] body="${text}"\n${String(e).slice(0, 200)}`);
    }
    await healthy(page, bad);
  });

  test("person page", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/person/6384", bad);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
  });

  test("API routes answer when signed in", async ({ page }) => {
    for (const p of ["/api/search?q=matrix", "/api/export"]) {
      const r = await page.request.get(p);
      expect(r.status(), p).toBeLessThan(500);
    }
  });
});
