import { test, expect } from "@playwright/test";
import { signIn } from "./auth";
import { configured } from "./seed";

// Add one step per page / data branch. Keep each test independent and clean up what it creates.
test("signed out: the login page loads and the home page redirects to it", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("signed out: the API answers 401 JSON", async ({ request }) => {
  const r = await request.get("/api/nothing");
  expect(r.status()).toBe(401);
});

test("signed in: the home page renders", async ({ page }) => {
  test.skip(!configured(), "Supabase / smoke account not configured");
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Something went wrong on our side")).toHaveCount(0);
});
