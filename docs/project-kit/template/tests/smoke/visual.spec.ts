import { test, expect } from "@playwright/test";
import { signIn } from "./auth";
import { configured } from "./seed";

// Read-only visual pass over every page. Add each new page to PAGES (CLAUDE.md > Verification).
const PAGES = ["/"];

for (const path of PAGES) {
  test(`visual: ${path} renders without overflow`, async ({ page }) => {
    test.skip(!configured(), "Supabase / smoke account not configured");
    await signIn(page);
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
