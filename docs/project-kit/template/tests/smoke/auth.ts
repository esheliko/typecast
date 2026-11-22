import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

/** Where global setup saves the smoke user's session cookies, so the ~30 signed-in tests don't each type the password again.
 *  One file per user, so runs that go side by side (each with its own temporary account) never touch each other's. */
const authFile = (userId: string) => path.join(".smoke-auth", `${userId}.json`);
const currentFile = () => (process.env.SMOKE_AUTH_FILE && fs.existsSync(process.env.SMOKE_AUTH_FILE) ? process.env.SMOKE_AUTH_FILE : null);
export function clearLogin(userId: string) { fs.rmSync(authFile(userId), { force: true }); }

async function uiLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.SMOKE_EMAIL!);
  await page.getByLabel("Password").fill(process.env.SMOKE_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Signs the page in. Uses the cookies saved by global setup when there are any, otherwise types the password. */
export async function signIn(page: Page) {
  const file = currentFile();
  if (file) {
    const { cookies } = JSON.parse(fs.readFileSync(file, "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] };
    await page.context().addCookies(cookies);
    await page.goto("/offline"); // light static page: leaves the tab on the app's origin (a few tests read storage before navigating), as the UI login did
    return;
  }
  await uiLogin(page);
}

/** One real login through the UI (the same one the tests used to do each), saved for `signIn`. Called once by global setup of the core run. */
export async function saveLogin(baseURL: string, userId: string) {
  const file = authFile(userId);
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ["--no-sandbox"] } : {});
  try {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await uiLogin(page);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await ctx.storageState({ path: file });
    process.env.SMOKE_AUTH_FILE = file; // workers inherit it
  } finally {
    await browser.close();
  }
}
