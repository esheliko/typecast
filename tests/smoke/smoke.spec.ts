import { test, expect, type Page } from "@playwright/test";
import { configured } from "./seed";

/** Errors that mean a page is broken. Image 404s and the like are not. */
const BROKEN = /Server Components render|Attempted to call|Hydration failed|Minified React error|Application error|Unhandled|Content Security Policy/i;

function watch(page: Page) {
  const bad: string[] = [];
  page.on("pageerror", (e) => bad.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && BROKEN.test(m.text())) bad.push(`console: ${m.text().slice(0, 300)}`); });
  return bad;
}

/** The page rendered its content: no error screen, no 5xx, no client or server render errors. */
async function healthy(page: Page, bad: string[]) {
  await expect(page.getByText("Something went wrong on our side")).toHaveCount(0);
  await expect(page.getByText(/Could not load your library|Suggestions unavailable|Stats unavailable|unavailable right now/)).toHaveCount(0);
  expect(bad, bad.join("\n")).toEqual([]);
}

async function visit(page: Page, path: string, bad: string[]) {
  const r = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(r?.status(), `${path} status`).toBeLessThan(400);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await healthy(page, bad);
}

/** Like `visit` but without waiting for the network to go quiet: for loops over many URLs that each assert visible content right after. */
async function visitQuick(page: Page, path: string, bad: string[]) {
  const r = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(r?.status(), `${path} status`).toBeLessThan(400);
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
    // Watch next: the seeded series in progress (just touched) leads the strip.
    const upnext = page.getByRole("region", { name: "Watch next" });
    await expect(upnext).toBeVisible();
    await expect(upnext.getByText("Breaking Bad").first()).toBeVisible({ timeout: 20_000 });
    // Upcoming: the seeded series are all candidates, but whether any has a future episode depends on TMDB today, so the section is
    // optional. When it is there it must open, and every row needs a date and a countdown (never "Invalid" or an empty cell).
    const upcoming = page.getByRole("region", { name: "Upcoming" });
    await page.waitForTimeout(3000);
    if (await upcoming.count()) {
      await upcoming.getByRole("button", { name: /Upcoming/ }).click();
      const rows = upcoming.locator(".up-row");
      await expect(rows.first()).toBeVisible();
      for (const row of await rows.all()) {
        await expect(row.locator(".up-date")).toHaveText(/\d/);
        await expect(row.locator(".pill")).not.toBeEmpty();
        await expect(row).not.toContainText(/NaN|undefined|Invalid/);
      }
      // The same data puts a small badge ("Out Fri", "S5 in 12 days") on those titles' Library rows, and each has a one-event calendar file.
      const badges = page.getByTestId("when-badge");
      await expect(badges.first()).toBeVisible();
      for (const b of await badges.all()) await expect(b).not.toContainText(/NaN|undefined|Invalid/);
      const href = await rows.first().getAttribute("href");
      const m = /\/title\/(movie|tv)\/(\d+)/.exec(href ?? "");
      if (m) {
        const r = await page.request.get(`/api/event?key=${m[1]}:${m[2]}`);
        expect(r.status()).toBe(200);
        expect(r.headers()["content-type"]).toContain("text/calendar");
        const body = await r.text();
        expect(body).toMatch(/^BEGIN:VCALENDAR\r\n/);
        expect(body).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/);
      }
      await upcoming.getByRole("button", { name: /Upcoming/ }).click(); // leave it collapsed for the steps below
    }
    // "On my services" toggle (shown only when the smoke user has services): filters to streamable picks or says nothing qualifies, and undoes cleanly.
    const mine = upnext.getByRole("button", { name: "On my services" });
    if (await mine.isVisible()) {
      await mine.click();
      await expect(mine).toHaveAttribute("aria-pressed", "true");
      await expect(upnext.locator(".upnext-card").first().or(upnext.locator(".upnext-empty"))).toBeVisible({ timeout: 20_000 });
      await mine.click();
      await expect(mine).toHaveAttribute("aria-pressed", "false");
      await expect(upnext.getByText("Breaking Bad").first()).toBeVisible();
    }
    // The server page reads these params and the client view applies them: this is the path that crashed in production.
    for (const q of ["f=watched", "f=watching", "f=watchlist", "f=partial", "s=title", "s=year", "s=yearOld", "s=rating", "s=watched", "f=watched&s=rating", "s=bogus", "k=movie", "k=tv&f=watching", "k=bogus"]) {
      await visitQuick(page, `/library?${q}`, bad);
      await expect(page.getByText("The Matrix").or(page.getByText("Breaking Bad")).first()).toBeVisible();
      await healthy(page, bad); // after the content is there, so a late render error still counts
    }
    // Films / Series switch: Series hides the films and keeps the shows.
    await visit(page, "/library", bad);
    await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Series" }).click();
    await expect(page.getByText("Breaking Bad").first()).toBeVisible();
    await expect(page.locator(".lib-row", { hasText: "The Matrix" })).toHaveCount(0);
  });

  test("Library stats: chip opens it, every year option and a bad year load", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/library", bad);
    await page.getByRole("link", { name: "Stats", exact: true }).click();
    await expect(page).toHaveURL(/\/library\/stats/);
    await expect(page.getByText("Longest streak")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    // The streamed TMDB part arrives (seeded watched films) with text values, not just bars.
    await expect(page.getByRole("heading", { name: "Top genres" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Time watched")).toBeVisible();
    await healthy(page, bad);
    for (const q of ["y=2026", "y=2025", "y=1900", "y=abc"]) {
      await visitQuick(page, `/library/stats?${q}`, bad);
      await expect(page.getByText("Longest streak")).toBeVisible({ timeout: 20_000 });
      await healthy(page, bad);
    }
    await visit(page, "/library/stats", bad);
    await page.getByRole("navigation", { name: "Year" }).getByRole("link", { name: "All time" }).click();
    await expect(page.getByText("Longest streak")).toBeVisible();
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

  test("a note typed just before leaving the title is saved", async ({ page }) => {
    const bad = watch(page);
    const note = `smoke note ${Date.now()}`;
    await visit(page, "/title/movie/550?full=1", bad);
    const box = page.getByLabel("Notes");
    await expect(box).toBeEnabled({ timeout: 20_000 });
    await box.fill(note);
    // Leave well inside the 700 ms debounce: the pending save must be flushed, not dropped.
    // The flush happens as the box unmounts; wait for its save to reach the server before reloading, or the hard load can abort it.
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.request().postData()?.includes(note) === true, { timeout: 20_000 });
    await page.getByRole("link", { name: "Library" }).first().click();
    await expect(page).toHaveURL(/\/library/);
    expect((await saved).ok()).toBe(true);
    await visit(page, "/title/movie/550?full=1", bad);
    await expect(page.getByLabel("Notes")).toHaveValue(note, { timeout: 20_000 });
    // Leave the seeded row as it was.
    await page.getByLabel("Notes").fill("");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    await healthy(page, bad);
  });

  // Watching now ("Who's that?"): start on a title, the sheet opens with the cast grid at the seeded episode, a face opens its panel,
  // the episode can be changed without touching saved progress, the About tab answers a fact, and the watch ends cleanly. No AI.
  test("Watching now: Who's that? sheet", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/title/tv/1396?full=1", bad);
    await page.getByRole("button", { name: /watching this now/ }).click();
    const sheet = page.getByRole("dialog", { name: /Who's on screen in Breaking Bad/ });
    await expect(sheet).toBeVisible();
    // Starts where the seeded progress is (S2 E3); the regulars are listed.
    await expect(sheet.getByLabel("Season")).toHaveValue("2");
    await expect(sheet.getByLabel("Episode")).toHaveValue("3");
    await expect(sheet.getByRole("button", { name: /^Bryan Cranston/ }).first()).toBeVisible({ timeout: 30_000 });
    // The search box filters by character name; a face opens its panel.
    await sheet.getByLabel("Search the cast").fill("walter");
    await sheet.getByRole("button", { name: /^Bryan Cranston/ }).first().click();
    await expect(sheet.getByText(/Plays Walter White/)).toBeVisible({ timeout: 20_000 });
    await sheet.getByRole("button", { name: /All faces/ }).click();
    // Step the episode forward and back; saved progress stays as it was.
    await sheet.getByLabel("Episode").selectOption("4");
    await expect(sheet.getByText(/up to S2 E4/)).toBeVisible();
    await sheet.getByLabel("Episode").selectOption("3");
    await expect(sheet.getByText(/up to S2 E3/)).toBeVisible();
    // About tab: a built-in fact is looked up (TMDB/Wikipedia, no AI).
    await sheet.getByRole("tab", { name: /About this episode/ }).click();
    await sheet.getByRole("button", { name: "Episodes left" }).click();
    await expect(sheet.getByText("Looking it up")).toHaveCount(0, { timeout: 30_000 });
    await sheet.getByRole("button", { name: "Close" }).click();
    await visit(page, "/library", bad);
    const bar = page.getByRole("region", { name: "Watching now" });
    await expect(bar).toContainText("S2 E3");
    await bar.getByRole("button").click();
    await sheet.getByRole("button", { name: "End this watch" }).click();
    await sheet.getByRole("button", { name: "Stop watching" }).click();
    await expect(bar).toHaveCount(0);
    expect((await page.request.get("/api/ask")).status()).toBe(404);
    await healthy(page, bad);
  });


  test("person page (full page)", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/person/6384?full=1", bad);
    await expect(page.getByRole("heading", { name: /Keanu Reeves/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("person popup (hard load restores it over Browse)", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/person/6384", bad);
    const dlg = page.getByRole("dialog", { name: "Person details" });
    await expect(dlg.getByRole("heading", { name: /Keanu Reeves/ })).toBeVisible({ timeout: 20_000 });
    await healthy(page, bad);
    await dlg.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/person\//);
  });

  test("person popup from a title popup: Back returns to the title, Close returns to Browse", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/", bad);
    // A hard load of the title restores its popup over Browse; then open a person from inside it.
    await page.goto("/title/movie/603");
    const title = page.getByRole("dialog", { name: "Title details" });
    await expect(title.getByRole("heading", { name: /The Matrix/ })).toBeVisible({ timeout: 20_000 });
    // Crew rows are plain links to people.
    const who = title.locator("a.credit-main[href^='/person/']").first();
    await expect(who).toBeVisible({ timeout: 20_000 });
    const href = await who.getAttribute("href");
    await who.click();
    await expect(page).toHaveURL(new RegExp(`${href!.split("?")[0]}(\\?|$)`));
    const person = page.getByRole("dialog", { name: "Person details" });
    await expect(person).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(person.getByRole("link", { name: "Full page" })).toHaveAttribute("href", new RegExp(`^${href!.split("?")[0]}\\?.*full=1`));
    // Back walks the trail to the title; Forward returns to the person.
    await person.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/title\/movie\/603/);
    await expect(page.getByRole("dialog", { name: "Title details" }).getByRole("heading", { name: /The Matrix/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Forward" }).click();
    await expect(page.getByRole("dialog", { name: "Person details" })).toBeVisible({ timeout: 20_000 });
    // Close goes all the way back to the page underneath.
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/(person|title)\//);
    await healthy(page, bad);
  });

  test("series: episodes, opening one, and an actor's episodes", async ({ page }) => {
    const bad = watch(page);
    // ?p= is how a title opened from a person's credits arrives: it shows their part (and here, their episodes) up top.
    await visit(page, "/title/tv/1396?full=1&p=17419", bad);
    await expect(page.getByText(/5 seasons · 62 episodes/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Every episode \(62\)/).first()).toBeVisible({ timeout: 20_000 });
    const eps = page.getByRole("region", { name: "Episodes" });
    await eps.getByRole("button", { name: /^S4( ✓)?$/ }).click();
    await eps.getByRole("button", { name: /Face Off/ }).click();
    await expect(eps.getByText("Directed by Vince Gilligan").first()).toBeVisible({ timeout: 20_000 });
    await expect(eps.getByText("Guest stars").first()).toBeVisible();
    // One-tap ticks move progress; Undo puts it back (the seeded row stays as it was).
    await eps.getByRole("button", { name: /^S3( ✓)?$/ }).click();
    await eps.getByRole("button", { name: "Mark watched up to S3 E2" }).click();
    await expect(eps.getByText("Up to S3 E2")).toBeVisible({ timeout: 20_000 });
    await eps.getByRole("button", { name: "Undo" }).click();
    await expect(eps.getByText("Up to S3 E2")).toHaveCount(0, { timeout: 20_000 });
    for (const p of ["/api/season?tv=1396&s=1", "/api/appearances?tv=1396&c=5276f5c9760ee34ca70c6628&n=3"]) {
      const r = await page.request.get(p);
      expect(r.status(), p).toBe(200);
    }
    await healthy(page, bad);
  });

  test("/who: Rookie S2, filter to women, open a face, see the timeline", async ({ page }) => {
    const bad = watch(page);
    await visit(page, "/who?k=tv-79744&s=2", bad);
    // Season 2, episode not set: the whole season counts, and the page says so.
    await expect(page.getByText("Includes all of season 2 because the episode is not set")).toBeVisible({ timeout: 30_000 });
    const tiles = page.locator(".wx-tile[data-pid]");
    await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
    const all = await tiles.count();
    await page.getByRole("group", { name: "Gender" }).getByRole("button", { name: "Women" }).click();
    await expect.poll(async () => tiles.count()).toBeLessThan(all);
    await expect(page.locator(".wx-count")).toContainText(" of ");
    // "/" focuses the finder; a character name finds her.
    await page.keyboard.press("/");
    await page.keyboard.type("Nell");
    await expect(page.locator(".wx-tile", { hasText: "Sara Rue" })).toBeVisible({ timeout: 15_000 });
    await page.locator(".wx-tile", { hasText: "Sara Rue" }).click();
    await expect(page.getByRole("heading", { name: "Sara Rue" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".wx-trail")).toContainText("Sara Rue");
    for (const h of ["Here", "You know them from", "Timeline", "With this cast"]) await expect(page.getByRole("region", { name: h })).toBeVisible();
    // Her own dates load (a skeleton until they do): The Big Bang Theory is Nov-Dec 2008. The list shows about five rows; Show all has the rest.
    await page.getByRole("region", { name: "Timeline" }).getByRole("button", { name: /Show all/ }).click();
    await expect(page.locator(".wx-trow", { hasText: "The Big Bang Theory" }).getByText("Nov-Dec 2008")).toBeVisible({ timeout: 45_000 });
    // Esc goes back one step to "This title", whose facts are cards, not a question box.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "The Rookie" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Trivia" })).toBeVisible();
    await expect(page.getByPlaceholder(/look something up/i)).toHaveCount(0);
    // Going back keeps the step (it is dimmed, not erased), the line of history is a recents chip, and the spoiler switch is always on screen.
    await expect(page.locator(".wx-trail")).toContainText("Sara Rue");
    await expect(page.locator(".wx-rchip[title*='Sara Rue']")).toBeVisible();
    await expect(page.getByRole("switch", { name: /No spoilers/ })).toHaveAttribute("aria-checked", "true");
    await healthy(page, bad);
  });

  test("/who: no title shows a search, and its API routes refuse bad input", async ({ page }) => {
    const bad = watch(page);
    await page.context().clearCookies({ name: "tc_watch" });
    await visit(page, "/who", bad);
    await expect(page.getByLabel("Search for a film or series")).toBeVisible();
    for (const p of ["/api/who/roster?k=bogus", "/api/who/person?id=abc", "/api/who/spans?p=1", "/api/who/pair?a=1&b=1", "/api/who/title?k=x-1", "/api/who/common?q=a&k=tv-1"]) {
      expect((await page.request.get(p)).status(), p).toBe(400);
    }
    await healthy(page, bad);
  });

  test("/who API answers 401 JSON when signed out (the request fixture carries no session)", async ({ request }) => {
    for (const p of ["/api/who/roster?k=tv-79744", "/api/who/person?id=10131"]) {
      const r = await request.get(p);
      expect(r.status(), p).toBe(401);
      expect(await r.json()).toHaveProperty("error");
    }
  });

  test("Add to calendar: bad keys are refused, a released film has nothing to add", async ({ page }) => {
    expect((await page.request.get("/api/event?key=bogus")).status()).toBe(400);
    expect((await page.request.get("/api/event?key=movie:603")).status()).toBe(404); // The Matrix is long out
  });

  test("Calendar feed fails closed: an unknown token is a plain 404, with or without the migration", async ({ request }) => {
    for (const f of [`${"a".repeat(32)}.ics`, "short.ics"]) expect((await request.get(`/cal/${f}`)).status(), f).toBe(404);
  });

  test("API routes answer when signed in", async ({ page }) => {
    for (const p of ["/api/search?q=matrix", "/api/export"]) {
      const r = await page.request.get(p);
      expect(r.status(), p).toBeLessThan(500);
    }
  });
});
