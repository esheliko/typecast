import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

/** Where global setup saves the smoke user's session cookies, so the ~30 signed-in tests don't each type the password again. */
export const AUTH_FILE = path.join(".smoke-auth", "state.json");

async function uiLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.SMOKE_EMAIL!);
  await page.getByLabel("Password").fill(process.env.SMOKE_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Signs the page in. Uses the cookies saved by global setup when there are any, otherwise types the password. */
export async function signIn(page: Page) {
  if (fs.existsSync(AUTH_FILE)) {
    const { cookies } = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] };
    await page.context().addCookies(cookies);
    await page.goto("/offline"); // light static page: leaves the tab on the app's origin (a few tests read storage before navigating), as the UI login did
    return;
  }
  await uiLogin(page);
}

/** One real login through the UI (the same one the tests used to do each), saved for `signIn`. Called once by global setup of the core run. */
export async function saveLogin(baseURL: string) {
  fs.rmSync(path.dirname(AUTH_FILE), { recursive: true, force: true });
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ["--no-sandbox"] } : {});
  try {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await uiLogin(page);
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await ctx.storageState({ path: AUTH_FILE });
  } finally {
    await browser.close();
  }
}
