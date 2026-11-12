import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./auth";
import { configured, deleteRows, rowOf, smokeClient, SCRATCH, SEED } from "./seed";

/**
 * Behaviour tests: they click through the real app and check what was saved. Every test only touches the titles it names
 * (SCRATCH or a Browse poster it checked was unsaved), verifies through the smoke user's own Supabase session, and cleans up in `finally`.
 */
/** The title card shows the current mark; the options (Status group) open on tap and close after a pick. Opens them if needed. */
async function statusMenu(page: Page) {
  const group = page.getByRole("group", { name: "Status" });
  if (!(await group.isVisible())) await page.locator(".mc-cur, .mc-more").click();
  await expect(group).toBeVisible({ timeout: 10_000 });
  return group;
}
async function pick(page: Page, name: string) {
  await (await statusMenu(page)).getByRole("button", { name, exact: true }).click();
}

test.describe("behaviour (signed in)", () => {
  test.skip(!configured(), "no SMOKE_EMAIL/SMOKE_PASSWORD: signed-in behaviour not tested");
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  const rowTitles = (page: Page) => page.locator(".lib-row .row-title");
  const inRow = (page: Page, title: string) => page.locator(".lib-row .row-title", { hasText: title });

  test("popup: mark Watched, see it in Library, change to To watch / Must watch, remove", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    const inception = SCRATCH[0];
    const status = () => rowOf(sb, userId, "movie", inception.tmdb_id);
    try {
      expect(await status(), "scratch title must start unsaved").toBeNull();
      await page.goto(`/title/movie/${inception.tmdb_id}`);
      const card = page.locator(".mc-cur, .mc-more");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await pick(page, "Watched");
      await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("watched");
      await expect(page.getByRole("status").filter({ hasText: `${inception.title}: Watched` })).toBeVisible();
      await pick(page, "Partly watched");
      await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("partial");
      await pick(page, "Watching");
      await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("watching");
      await pick(page, "Watched");
      await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("watched");

      await page.goto("/library?f=watched");
      await expect(inRow(page, inception.title)).toBeVisible({ timeout: 20_000 });

      await page.goto(`/title/movie/${inception.tmdb_id}?full=1`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText("Watched");
      await pick(page, "To watch");
      await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("watchlist");
      await statusMenu(page);
      await page.getByRole("group", { name: "How much you want to watch it" }).getByRole("button", { name: "Must watch" }).click();
      await expect.poll(async () => (await status())?.priority, { timeout: 15_000 }).toBe("must");

      await page.goto("/library?f=watchlist");
      await expect(inRow(page, inception.title)).toBeVisible({ timeout: 20_000 });
      await page.goto("/library?f=watched");
      await expect(inRow(page, "Fight Club")).toBeVisible({ timeout: 20_000 });
      await expect(inRow(page, inception.title)).toHaveCount(0);

      await page.goto(`/title/movie/${inception.tmdb_id}?full=1`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      // Tapping the lit mark removes it, with the same toast and Undo as the quick marks; Undo brings it back.
      await pick(page, "To watch");
      await expect.poll(status, { timeout: 15_000 }).toBeNull();
      await expect(page.getByRole("status").filter({ hasText: `Removed ${inception.title}` })).toBeVisible();
      await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("watchlist");
      await pick(page, "To watch");
      await expect.poll(status, { timeout: 15_000 }).toBeNull();
      await page.goto("/library");
      await expect(inRow(page, "The Matrix")).toBeVisible({ timeout: 20_000 });
      await expect(inRow(page, inception.title)).toHaveCount(0);
    } finally {
      await deleteRows(sb, userId, [inception]);
    }
  });

  // Watching now and the library: only the explicit start button writes (missing / To watch become Watching with the place saved), Stop watching puts it back,
  // and moving the episode while the title is Watching saves ONE debounced place. Titles: Chernobyl (scratch, not in the library), Stranger Things and Breaking Bad (seeded).
  test("Watching now: start adds to Watching, stop restores, the place is saved while Watching", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    const progress = async (id: number) => (await rowOf(sb, userId, "tv", id)) as { status: string; progress_season?: number | null; progress_episode?: number | null } | null;
    const chernobyl = SCRATCH[2], st = SEED.find((r) => r.tmdb_id === 66732)!, bb = SEED.find((r) => r.tmdb_id === 1396)!;
    try {
      expect(await progress(chernobyl.tmdb_id), "scratch title must start unsaved").toBeNull();
      // Looking is free: /watching?k=... and the pickers write nothing.
      await page.goto(`/watching?k=tv-${chernobyl.tmdb_id}&s=1&e=2`);
      await expect(page.getByRole("main", { name: /Watching now: Chernobyl/ })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      expect(await progress(chernobyl.tmdb_id)).toBeNull();
      // Not in the library: start adds it as Watching at S1 E1 and says so.
      await page.goto(`/title/tv/${chernobyl.tmdb_id}?full=1`);
      await page.getByRole("button", { name: /watching this now/ }).click();
      await page.waitForURL(/\/watching/, { timeout: 30_000 });
      await expect(page.getByRole("status").filter({ hasText: `${chernobyl.title}: added to Watching` })).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => (await progress(chernobyl.tmdb_id))?.status, { timeout: 15_000 }).toBe("watching");
      // The place is S1 E1 (the episode being watched), so nothing is finished yet: no progress is written.
      expect((await progress(chernobyl.tmdb_id))?.progress_season ?? null).toBeNull();
      // Stop watching with nothing beyond the start saved: gone again.
      await page.getByRole("button", { name: "End this watch" }).click({ timeout: 30_000 });
      await page.getByRole("button", { name: "Stop watching" }).click();
      await expect.poll(() => progress(chernobyl.tmdb_id), { timeout: 15_000 }).toBeNull();

      // To watch: start promotes, stop puts it back on the Watchlist.
      await page.goto(`/title/tv/${st.tmdb_id}?full=1`);
      await page.getByRole("button", { name: /watching this now/ }).click();
      await page.waitForURL(/\/watching/, { timeout: 30_000 });
      await expect.poll(async () => (await progress(st.tmdb_id))?.status, { timeout: 15_000 }).toBe("watching");
      await page.getByRole("button", { name: "End this watch" }).click({ timeout: 30_000 });
      await page.getByRole("button", { name: "Stop watching" }).click();
      await expect.poll(async () => (await progress(st.tmdb_id))?.status, { timeout: 15_000 }).toBe("watchlist");

      // Breaking Bad is Watching in the library with progress S2 E3 (watched up to there): /watching?k= opens at the NEXT episode, S2 E4, with no cookie,
      // and Next marks S2 E4 as watched (progress S2 E4).
      await page.goto(`/watching?k=tv-${bb.tmdb_id}`);
      const main = page.getByRole("main", { name: /Watching now: Breaking Bad/ });
      await expect(main.getByRole("button", { name: /^Episode: E4/ })).toBeVisible({ timeout: 30_000 });
      const next = main.getByRole("button", { name: /^Next episode/ });
      await expect(next).toBeEnabled({ timeout: 30_000 });
      await next.click();
      await expect.poll(async () => (await progress(bb.tmdb_id))?.progress_episode, { timeout: 15_000 }).toBe(4);
    } finally {
      await deleteRows(sb, userId, [chernobyl]);
      await sb.from("library_items").update({ status: "watchlist", progress_season: null, progress_episode: null }).eq("user_id", userId).eq("tmdb_type", "tv").eq("tmdb_id", st.tmdb_id);
      await sb.from("library_items").update({ progress_season: 2, progress_episode: 3 }).eq("user_id", userId).eq("tmdb_type", "tv").eq("tmdb_id", bb.tmdb_id);
    }
  });

  // The title switcher on /watching: a quiet chevron after the title, only while ANOTHER title is Watching in the library. It lists the other Watching titles
  // (title and place, never the page's own title), choosing one opens that page, and none of it writes to the library. Titles: Chernobyl (scratch, made Watching here) and Breaking Bad (seeded Watching, S2 E3).
  test("Watching now: title switcher lists the other Watching titles and writes nothing", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    const show = SCRATCH[2], bb = SEED.find((r) => r.tmdb_id === 1396)!;
    const chev = page.getByRole("button", { name: "Switch title" });
    const row = async (id: number) => (await rowOf(sb, userId, "tv", id)) as { status: string; progress_season?: number | null; progress_episode?: number | null } | null;
    try {
      const { error } = await sb.from("library_items").upsert({ user_id: userId, ...show, year: "2019", poster_path: null, status: "watching", priority: "someday", rating: 0, note: "",
        progress_season: 1, progress_episode: 2 }, { onConflict: "user_id,tmdb_type,tmdb_id" });
      expect(error?.message).toBeUndefined();
      await page.goto(`/watching?k=tv-${show.tmdb_id}&s=1&e=2`);
      await expect(page.getByRole("main", { name: /Watching now: Chernobyl/ })).toBeVisible({ timeout: 30_000 });
      await expect(chev).toBeVisible({ timeout: 15_000 });
      const header = page.locator(".wx-top");
      const h = (await header.boundingBox())!.height;
      await chev.click();
      const menu = page.getByRole("navigation", { name: /Switch from Chernobyl/ });
      await expect(menu.getByRole("link", { name: /Breaking Bad/ })).toContainText("S2 E4"); // the episode to continue with (progress S2 E3)
      await expect(menu.getByRole("link", { name: /^Chernobyl/ })).toHaveCount(0);
      expect(Math.abs((await header.boundingBox())!.height - h), "opening the menu must not change the header height").toBeLessThan(1);
      // Esc closes it and puts focus back on the chevron.
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(chev).toBeFocused();
      // Search another title: the search shows even though a watch/title is open, and picking nothing changes nothing.
      await chev.click();
      await menu.getByRole("link", { name: /Search another title/ }).click();
      await page.waitForURL(/\/watching\?search=1/, { timeout: 30_000 });
      await expect(page.getByRole("searchbox", { name: "Search for a film or series" })).toBeVisible({ timeout: 30_000 });
      // Choosing another title opens its page at the saved place.
      await page.goto(`/watching?k=tv-${show.tmdb_id}&s=1&e=2`);
      await chev.click();
      await menu.getByRole("link", { name: /Breaking Bad/ }).click();
      await page.waitForURL(/\/watching\?k=tv-1396&s=2&e=4/, { timeout: 30_000 });
      await expect(page.getByRole("main", { name: /Watching now: Breaking Bad/ })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      expect(await row(show.tmdb_id)).toMatchObject({ status: "watching", progress_season: 1, progress_episode: 2 });
      expect(await row(bb.tmdb_id)).toMatchObject({ status: "watching", progress_season: 2, progress_episode: 3 });
      // No other Watching title: no chevron at all.
      await sb.from("library_items").update({ status: "watchlist" }).eq("user_id", userId).eq("tmdb_type", "tv").eq("tmdb_id", bb.tmdb_id);
      await page.goto(`/watching?k=tv-${show.tmdb_id}&s=1&e=2`);
      await expect(page.getByRole("main", { name: /Watching now: Chernobyl/ })).toBeVisible({ timeout: 30_000 });
      await expect(chev).toHaveCount(0);
    } finally {
      await deleteRows(sb, userId, [show]);
      await sb.from("library_items").update({ status: "watching", progress_season: 2, progress_episode: 3 }).eq("user_id", userId).eq("tmdb_type", "tv").eq("tmdb_id", bb.tmdb_id);
    }
  });

  // Next means "I finished this episode": the episode you were on becomes the saved progress (ONE write, toast with Undo); Undo puts the old progress back.
  // Scratch title Band of Brothers (read by no other test), Watching with progress S1 E2, so the page opens at S1 E3.
  test("Watching now: Next marks the episode you were on as watched, with Undo", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    const show = SCRATCH[3];
    const row = async () => (await rowOf(sb, userId, "tv", show.tmdb_id)) as { status: string; progress_season?: number | null; progress_episode?: number | null } | null;
    try {
      const { error } = await sb.from("library_items").upsert({ user_id: userId, ...show, year: "2001", poster_path: null, status: "watching", priority: "someday", rating: 0, note: "",
        progress_season: 1, progress_episode: 2 }, { onConflict: "user_id,tmdb_type,tmdb_id" });
      expect(error?.message).toBeUndefined();
      await page.goto(`/watching?k=tv-${show.tmdb_id}`);
      const main = page.getByRole("main", { name: /Watching now: Band of Brothers/ });
      await expect(main.getByRole("button", { name: /^Episode: E3/ })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      expect(await row(), "opening the page writes nothing").toMatchObject({ progress_season: 1, progress_episode: 2 });
      const next = main.getByRole("button", { name: /^Next episode/ });
      await expect(next).toBeEnabled({ timeout: 30_000 });
      await next.click();
      await expect(page.getByRole("status").filter({ hasText: "S1 E3 marked watched" })).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => (await row())?.progress_episode, { timeout: 15_000 }).toBe(3);
      await expect(main.getByRole("button", { name: /^Episode: E4/ })).toBeVisible();
      // Undo brings the old progress back.
      await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => (await row())?.progress_episode, { timeout: 15_000 }).toBe(2);
      expect((await row())?.status).toBe("watching");
    } finally {
      await deleteRows(sb, userId, [show]);
    }
  });

  test("Browse: quick-mark a poster, then Undo from the toast leaves nothing saved", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    let made: { type: string; id: number } | null = null;
    try {
      await page.goto("/");
      const poster = page.locator(".pc:not(.is-watching):not(.is-partial):not(.is-watched):not(.is-watchlist)").first();
      await expect(poster).toBeVisible({ timeout: 30_000 });
      const href = await poster.locator("a.pc-link").getAttribute("href");
      const m = /\/title\/(movie|tv)\/(\d+)/.exec(href ?? "");
      expect(m, `poster link ${href}`).not.toBeNull();
      const target = { type: m![1], id: Number(m![2]) };
      // Only a title the account does not have yet, so there is nothing of the user's to disturb.
      expect(await rowOf(sb, userId, target.type, target.id), "poster title must start unsaved").toBeNull();
      made = target;

      await poster.hover();
      await poster.getByRole("button", { name: /^To watch: .*(?<!Tap to remove)$/ }).click();
      const toast = page.locator(".toast", { has: page.getByRole("button", { name: "Undo" }) });
      await expect(toast).toBeVisible();
      await expect.poll(() => rowOf(sb, userId, target.type, target.id), { timeout: 4_000, intervals: [150] }).not.toBeNull();
      await toast.getByRole("button", { name: "Undo" }).click();
      await expect.poll(() => rowOf(sb, userId, target.type, target.id), { timeout: 15_000 }).toBeNull();
      await expect(poster.getByRole("button", { name: /^To watch: .*(?<!Tap to remove)$/ })).toHaveAttribute("aria-pressed", "false");
      // Still nothing after the app has had time to settle and a reload.
      await page.reload();
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      expect(await rowOf(sb, userId, target.type, target.id)).toBeNull();
    } finally {
      if (made) await deleteRows(sb, userId, [{ tmdb_type: made.type, tmdb_id: made.id }]);
    }
  });

  test("quick mark has no server round trip, yet Library (client navigation) shows it", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    let made: { type: string; id: number } | null = null;
    try {
      await page.goto("/");
      const poster = page.locator(".pc:not(.is-watching):not(.is-partial):not(.is-watched):not(.is-watchlist)").first();
      await expect(poster).toBeVisible({ timeout: 30_000 });
      const m = /\/title\/(movie|tv)\/(\d+)/.exec((await poster.locator("a.pc-link").getAttribute("href")) ?? "");
      expect(m).not.toBeNull();
      const target = { type: m![1], id: Number(m![2]) };
      expect(await rowOf(sb, userId, target.type, target.id), "poster title must start unsaved").toBeNull();
      made = target;
      // Visit Library first so it sits in the client router cache: the mark must still show up there afterwards.
      await page.getByRole("link", { name: "Library" }).first().click();
      await expect(inRow(page, "The Matrix")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("link", { name: /^(Browse|Home|Discover)/ }).first().click();
      await expect(poster).toBeVisible({ timeout: 30_000 });

      // The mark is one server action POST whose response carries no re-rendered page (a revalidating action returns the whole RSC tree).
      const sizes: number[] = [];
      page.on("response", async (r) => { if (r.request().method() === "POST" && r.request().headers()["next-action"]) sizes.push((await r.body().catch(() => Buffer.alloc(0))).length); });
      await poster.hover();
      await poster.getByRole("button", { name: /^To watch: .*(?<!Tap to remove)$/ }).click();
      await expect.poll(() => rowOf(sb, userId, target.type, target.id), { timeout: 8_000, intervals: [150] }).not.toBeNull();
      await page.waitForTimeout(1_000);
      expect(sizes.length, "one server action for one mark").toBe(1);
      expect(sizes[0], "action response must not carry a re-rendered page").toBeLessThan(2_000);

      const title = (await rowOf(sb, userId, target.type, target.id))!.title;
      await page.getByRole("link", { name: "Library" }).first().click();
      await expect(inRow(page, title)).toBeVisible({ timeout: 20_000 });
    } finally {
      if (made) await deleteRows(sb, userId, [{ tmdb_type: made.type, tmdb_id: made.id }]);
    }
  });

  test("popup: mark in the popup, close it, the poster underneath shows the mark", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    let made: { type: string; id: number } | null = null;
    try {
      await page.goto("/");
      const first = page.locator(".pc:not(.is-watching):not(.is-partial):not(.is-watched):not(.is-watchlist)").first();
      await expect(first).toBeVisible({ timeout: 30_000 });
      const href = (await first.locator("a.pc-link").getAttribute("href")) ?? "";
      // Pin the poster by its link: marks now show on it at once, so a "not yet marked" selector would jump to another card.
      const poster = page.locator(".pc", { has: page.locator(`a.pc-link[href="${href}"]`) }).first();
      const link = poster.locator("a.pc-link");
      const m = /\/title\/(movie|tv)\/(\d+)/.exec(href);
      expect(m).not.toBeNull();
      const target = { type: m![1], id: Number(m![2]) };
      expect(await rowOf(sb, userId, target.type, target.id), "poster title must start unsaved").toBeNull();
      made = target;
      await link.click();
      const card = page.locator(".mc-cur, .mc-more");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await pick(page, "To watch");
      await expect(card).toContainText("To watch");
      await expect.poll(async () => (await rowOf(sb, userId, target.type, target.id))?.status, { timeout: 15_000 }).toBe("watchlist");
      await page.keyboard.press("Escape");
      await expect(card).toHaveCount(0, { timeout: 10_000 });
      await expect(poster.getByRole("button", { name: /^To watch: .*Tap to remove$/ })).toHaveAttribute("aria-pressed", "true");
    } finally {
      if (made) await deleteRows(sb, userId, [{ tmdb_type: made.type, tmdb_id: made.id }]);
    }
  });

  test("Library: filter chips, text filter and sort narrow and order the list", async ({ page }) => {
    await page.goto("/library");
    await expect(inRow(page, "The Matrix").first()).toBeVisible({ timeout: 20_000 }); // .first() on every visibility check here: a row can render twice for a moment after load or a filter change (strict-mode violation in CI at 87a2811)
    const chips = page.getByRole("group", { name: "Filter" });

    await chips.getByRole("button", { name: /^Watched\b/ }).click();
    await expect(page).toHaveURL(/f=watched/);
    await expect(inRow(page, "The Matrix").first()).toBeVisible();
    await expect(inRow(page, "Game of Thrones").first()).toBeVisible();
    await expect(inRow(page, "Pulp Fiction")).toHaveCount(0);
    await expect(inRow(page, "Breaking Bad")).toHaveCount(0);

    await chips.getByRole("button", { name: /^To watch\b/ }).click();
    await expect(inRow(page, "Pulp Fiction").first()).toBeVisible();
    await expect(inRow(page, "Stranger Things").first()).toBeVisible();
    await expect(inRow(page, "The Matrix")).toHaveCount(0);

    await chips.getByRole("button", { name: /^All\b/ }).click();
    await expect(page).not.toHaveURL(/f=/);
    const box = page.getByLabel("Filter library");
    await box.fill("break");
    await expect(inRow(page, "Breaking Bad").first()).toBeVisible();
    await expect(inRow(page, "The Matrix")).toHaveCount(0);
    await box.fill("zzzzzz");
    await expect(page.getByText(/Nothing in this list matches/)).toBeVisible();
    await box.fill("");
    await expect(inRow(page, "The Matrix").first()).toBeVisible();

    await page.getByLabel("Sort library").selectOption("title");
    await expect(page).toHaveURL(/s=title/);
    const titles = (await rowTitles(page).allInnerTexts()).map((t) => t.trim());
    expect(titles.length).toBeGreaterThanOrEqual(SEED.length);
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
    expect(titles).toEqual([...titles].sort(cmp));
    // The default order is "recently added", which is not alphabetical for the seeded set.
    await page.getByLabel("Sort library").selectOption("added");
    await expect(page).not.toHaveURL(/s=/);
    expect((await rowTitles(page).allInnerTexts()).map((t) => t.trim())).not.toEqual(titles);
  });

  test("Settings: country and a service survive a reload", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    const { data: before, error } = await sb.from("profiles").select("country,services,service_names").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    const profile = async () => (await sb.from("profiles").select("country,services,service_names").eq("user_id", userId).maybeSingle()).data;
    try {
      const country = before?.country === "GB" ? "DE" : "GB";
      await page.goto("/setup");
      await expect(page.locator("#cc")).toHaveCount(1); // settles after any popup restore
      await page.locator("#cc").selectOption(country);
      await expect.poll(async () => (await profile())?.country, { timeout: 15_000 }).toBe(country);

      await page.getByRole("button", { name: /^Your services/ }).click();
      const dialog = page.getByRole("dialog", { name: "Your services" });
      const chip = dialog.locator("button.chip[aria-pressed=false]").first();
      await expect(chip).toBeVisible({ timeout: 30_000 });
      const name = (await chip.innerText()).trim();
      await chip.click();
      await expect(dialog.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => Object.values(((await profile())?.service_names ?? {}) as Record<string, string>), { timeout: 15_000 }).toContain(name);

      await page.reload();
      await expect(page.locator("#cc")).toHaveCount(1);
      await expect(page.locator("#cc")).toHaveValue(country);
      await expect(page.getByRole("button", { name: /^Your services/ })).toContainText(name.slice(0, 12));
      await page.getByRole("button", { name: /^Your services/ }).click();
      await expect(page.getByRole("dialog", { name: "Your services" }).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
    } finally {
      // Put the account's profile back exactly as it was.
      if (before) await sb.from("profiles").upsert({ user_id: userId, country: before.country, services: before.services, service_names: before.service_names }, { onConflict: "user_id" });
      else await sb.from("profiles").delete().eq("user_id", userId);
    }
  });

  test("Import: a pasted list is saved, shown in the review, and can be reverted", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    const [inception, ghibli] = SCRATCH;
    try {
      for (const t of SCRATCH) expect(await rowOf(sb, userId, "movie", t.tmdb_id), `${t.title} must start unsaved`).toBeNull();
      await page.goto("/setup");
      await page.getByRole("button", { name: /^Import a list/ }).click();
      const dialog = page.getByRole("dialog", { name: "Import a list" });
      await dialog.getByLabel("Paste a list").fill("[x] Inception (2010)\n[x] Spirited Away (2001)");
      await expect(dialog.getByText(/2 watched/)).toBeVisible();
      await dialog.getByRole("button", { name: "Import", exact: true }).click();
      await expect(dialog.getByText(/Done: 2 added/)).toBeVisible({ timeout: 60_000 });
      for (const t of [inception, ghibli]) {
        expect((await rowOf(sb, userId, "movie", t.tmdb_id))?.status, t.title).toBe("watched");
      }

      await dialog.getByRole("button", { name: /^Review import/ }).click();
      const review = page.getByRole("dialog", { name: "Review import" });
      await expect(review.getByText("Inception (2010)", { exact: true })).toBeVisible();
      await expect(review.getByText("Spirited Away (2001)", { exact: true })).toBeVisible();

      await review.getByRole("button", { name: "Revert import" }).click();
      await review.getByRole("button", { name: "Yes, revert it" }).click();
      await expect(review).toHaveCount(0, { timeout: 30_000 });
      for (const t of [inception, ghibli]) await expect.poll(() => rowOf(sb, userId, "movie", t.tmdb_id), { timeout: 15_000 }).toBeNull();
    } finally {
      await deleteRows(sb, userId, SCRATCH);
    }
  });

  test("/api/export returns the library as JSON", async ({ page }) => {
    const r = await page.request.get("/api/export");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/json");
    expect(r.headers()["content-disposition"]).toContain("typecast-backup.json");
    const j = await r.json();
    expect(j).toHaveProperty("profile");
    expect(Number.isNaN(Date.parse(j.exportedAt))).toBe(false);
    expect(Array.isArray(j.library)).toBe(true);
    const titles = new Set((j.library as { title: string }[]).map((l) => l.title));
    for (const s of SEED) expect(titles.has(s.title), `export is missing ${s.title}`).toBe(true);
    const matrix = (j.library as { title: string; status: string; rating: number }[]).find((l) => l.title === "The Matrix");
    expect(matrix?.status).toBe("watched");
    expect(matrix?.rating).toBe(5);
  });
  test("Restore backup: restoring your own export reports everything unchanged; junk is rejected", async ({ page }) => {
    const exported = await (await page.request.get("/api/export")).text();
    const total = (JSON.parse(exported).library as unknown[]).length;
    await page.goto("/setup");
    await page.getByRole("button", { name: /^Restore backup/ }).click();
    const dialog = page.getByRole("dialog", { name: "Restore backup" });
    await dialog.getByLabel("Backup file").setInputFiles({ name: "typecast-backup.json", mimeType: "application/json", buffer: Buffer.from(exported) });
    await expect(dialog.getByText(`${total} titles in typecast-backup.json`)).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("0 new, will be added")).toBeVisible();
    await expect(dialog.getByText(/^0 would change/)).toBeVisible();
    await expect(dialog.getByText(`${total} unchanged`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Nothing to restore" })).toBeDisabled();
    await dialog.getByLabel("Backup file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"library":[{"type":"movie"}]}') });
    await expect(dialog.getByRole("alert")).toContainText("Title 1");
  });

  test("Change password: wrong current password and mismatched new ones are refused", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: /^Change password/ }).click();
    const dialog = page.getByRole("dialog", { name: "Change password" });
    await dialog.getByLabel("Current password").fill("definitely-not-the-password");
    await dialog.getByLabel("New password", { exact: true }).fill("another-long-one-1");
    await dialog.getByLabel("Repeat new password").fill("another-long-one-2");
    await dialog.getByRole("button", { name: "Change password" }).click();
    await expect(dialog.getByRole("alert")).toContainText("don't match");
    await dialog.getByLabel("Repeat new password").fill("another-long-one-1");
    await dialog.getByRole("button", { name: "Change password" }).click();
    await expect(dialog.getByRole("alert")).toContainText("current password is wrong", { timeout: 30_000 });
  });

  test("a watched series with a newer episode returns as Watching with a New episode badge, and Watched clears it", async ({ page }) => {
    const { sb, userId } = await smokeClient();
    const show = SCRATCH[2];
    const row = () => rowOf(sb, userId, "tv", show.tmdb_id);
    // The flag columns come from migration 0008; until it is applied the series still moves to Watching, just without a badge.
    const hasFlag = !(await sb.from("library_items").select("new_episode_at").limit(1)).error;
    try {
      const { error } = await sb.from("library_items").upsert({ user_id: userId, ...show, year: "2019", poster_path: null, status: "watched", priority: "someday", rating: 0, note: "",
        watched_at: "2015-01-01T00:00:00Z", checked_at: null }, { onConflict: "user_id,tmdb_type,tmdb_id" });
      expect(error?.message).toBeUndefined();
      // Signing in already ran the once-per-browser-session recheck (before this row existed); forget it, as a new session would.
      await page.evaluate(() => sessionStorage.removeItem("typecast.rechecked"));
      await page.goto("/library");
      await expect.poll(async () => (await row())?.status, { timeout: 45_000, message: "the new-episode check should move it to Watching" }).toBe("watching");
      if (hasFlag) {
        expect((await row())?.new_episode_at).toBeTruthy();
        await page.goto("/library?f=watching");
        await expect(inRow(page, show.title)).toBeVisible({ timeout: 20_000 });
        const badge = page.locator(".lib-row", { hasText: show.title }).getByTestId("new-ep");
        await expect(badge).toBeVisible({ timeout: 20_000 });
        await expect(badge).toHaveText(/New (episode|season)/);
      }
      await page.goto(`/title/tv/${show.tmdb_id}`);
      const card = page.locator(".mc-cur, .mc-more");
      await expect(card).toBeVisible({ timeout: 30_000 });
      if (hasFlag) await expect(page.getByTestId("new-ep").first()).toContainText(/aired/);
      await pick(page, "Watched");
      await expect.poll(async () => (await row())?.status, { timeout: 15_000 }).toBe("watched");
      if (hasFlag) {
        await expect.poll(async () => (await row())?.new_episode_at ?? null, { timeout: 15_000 }).toBeNull();
        await expect(page.getByTestId("new-ep")).toHaveCount(0);
      }
    } finally {
      await deleteRows(sb, userId, [show]);
    }
  });

  test("search: top result for a title and for a person, Enter and arrow keys, no unknown people", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("searchbox", { name: /Search films/ });
    await expect(box).toBeVisible({ timeout: 30_000 });
    // A title: "Top result" is the film, and no stranger named Dune leads the page.
    await box.fill("dune");
    const top = page.locator("[data-top]");
    await expect(top).toContainText(/^Dune/i, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Top result" })).toBeVisible();
    await expect(page.locator(".person-chip")).toHaveCount(0);
    // Arrow Down goes from the box into the results, Arrow Up comes back.
    await box.press("ArrowDown");
    await expect(page.locator(".results a:focus")).toHaveCount(1);
    await page.keyboard.press("ArrowUp");
    await expect(box).toBeFocused();
    // Enter opens the top result in the popup.
    await box.press("Enter");
    await expect(page).toHaveURL(/\/title\/(movie|tv)\/\d+/, { timeout: 20_000 });
    await page.goBack();
    // A person: the famous one leads, not the blank profiles named exactly "Nolan".
    await box.fill("nolan");
    await expect(top).toContainText("Christopher Nolan", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Also named nolan/i })).toBeVisible();
    // Escape clears the box.
    await box.press("Escape");
    await expect(box).toHaveValue("");
  });
});
