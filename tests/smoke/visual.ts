import { expect, type Page } from "@playwright/test";

/** Console text that means a browser security rule blocked something (a CSP violation shows up as a console error). */
export const CSP_MSG = /Content Security Policy|violates the following/i;

/** Collects page errors, CSP violations and render errors for the life of a page. Call before the first navigation. */
export function collect(page: Page) {
  const bad: string[] = [];
  page.on("pageerror", (e) => bad.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (CSP_MSG.test(t) || /Server Components render|Attempted to call|Hydration failed|Minified React error|Application error/i.test(t)) bad.push(`console: ${t.slice(0, 300)}`);
  });
  return bad;
}

/**
 * Every image that is on screen (or within one screen below it) has loaded: none is broken (naturalWidth 0) and none is still
 * pending after `ms`. Lazy images far below the fold are ignored. Returns a list of problems, empty when all is well.
 */
export async function brokenImages(page: Page, ms = 15_000): Promise<string[]> {
  const probe = () => page.evaluate(() => {
    const h = window.innerHeight;
    const out: string[] = [];
    for (const i of Array.from(document.images)) {
      const r = i.getBoundingClientRect();
      if (!i.currentSrc || i.currentSrc.startsWith("data:") || r.width < 8 || r.bottom < 0 || r.top > h * 2 || getComputedStyle(i).visibility === "hidden") continue;
      // Detail for a pending image, so a CDN slow-down can be told from a real bug: lazy or eager, where it sits, and whether the browser ever asked for it.
      if (!i.complete) out.push(`pending ${i.currentSrc.slice(0, 90)} [${i.loading}, top ${Math.round(r.top)}px of ${h}, left ${Math.round(r.left)}px, requested ${performance.getEntriesByName(i.currentSrc).length > 0 ? "yes" : "no"}]`);
      else if (i.naturalWidth === 0) out.push(`broken ${i.currentSrc.slice(0, 90)}`);
    }
    return out;
  });
  const end = Date.now() + ms;
  let last = await probe();
  while (last.length && Date.now() < end) { await page.waitForTimeout(400); last = await probe(); }
  return last;
}

/** Cheap "does this look right" checks that need no baseline picture: real content, nothing wider than the screen, images loaded. */
export async function looksRight(page: Page, bad: string[], what: string) {
  await expect(page.getByText("Something went wrong on our side"), `${what}: error screen`).toHaveCount(0);
  const m = await page.evaluate(() => ({
    text: (document.body.innerText || "").trim().length,
    over: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(m.text, `${what}: page is blank`).toBeGreaterThan(20);
  expect(m.over, `${what}: sideways scroll (${m.over}px wider than the screen)`).toBeLessThanOrEqual(1);
  const imgs = await brokenImages(page);
  expect(imgs, `${what}: images did not load\n${imgs.join("\n")}`).toEqual([]);
  expect(bad, `${what}: ${bad.join("\n")}`).toEqual([]);
}
