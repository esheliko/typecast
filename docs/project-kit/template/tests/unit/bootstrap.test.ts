import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { slugify, validateInputs, substitute, leftover, vercelEnv, startIssues, VERCEL_REGION, TEMPLATE_ONLY } from "../../scripts/bootstrap-core.mjs";

test("slugify makes a safe repo name", () => {
  assert.equal(slugify("My Cool App!"), "my-cool-app");
  assert.equal(slugify("  --Café  Tracker-- "), "cafe-tracker");
  assert.ok(slugify("x".repeat(80)).length <= 40);
});

test("validateInputs names every problem", () => {
  const ok = { name: "Habit Tracker", slug: "habit-tracker", purpose: "Track daily habits with streaks.", visibility: "private", region: "ap-south-1" };
  assert.deepEqual(validateInputs(ok), []);
  assert.ok(validateInputs({ ...ok, name: "It's" }).some((m: string) => m.startsWith("name")));
  assert.ok(validateInputs({ ...ok, slug: "Bad Slug" }).some((m: string) => m.startsWith("slug")));
  assert.ok(validateInputs({ ...ok, purpose: "short" }).some((m: string) => m.startsWith("purpose")));
  assert.ok(validateInputs({ ...ok, region: "mars-1" }).some((m: string) => m.startsWith("region")));
  assert.ok(validateInputs({}).length >= 3);
});

test("substitute fills known placeholders and reports unknown ones", () => {
  assert.equal(substitute("# {{NAME}} ({{SLUG}})", { NAME: "A", SLUG: "a" }), "# A (a)");
  assert.deepEqual(leftover(substitute("{{NAME}} {{OTHER}} {{OTHER}}", { NAME: "A" })), ["OTHER"]);
  assert.equal(substitute("{{NAME}}", { NAME: "$&" }), "$&"); // no replacement-pattern surprises
});

test("vercel env keeps the service key out of the browser-visible kind", () => {
  const e = vercelEnv({ url: "u", anon: "a", service: "s" });
  assert.equal(e.find((x: { key: string }) => x.key === "SUPABASE_SERVICE_ROLE_KEY").type, "encrypted");
  assert.ok(e.filter((x: { key: string }) => x.key.startsWith("NEXT_PUBLIC_")).every((x: { type: string }) => x.type === "plain"));
});

test("the first issues keep #1 for the board and #2 for CI status", () => {
  const i = startIssues({ name: "A", purpose: "Do a thing well." });
  assert.equal(i.length, 3);
  assert.match(i[0].title, /board/i);
  assert.match(i[1].title, /CI/);
  assert.match(i[2].body, /Do a thing well\./);
});

test("every supabase region maps to a vercel region and template-only files are listed", () => {
  assert.ok(Object.values(VERCEL_REGION).every((r) => /^[a-z]{3}\d$/.test(r as string)));
  assert.ok(TEMPLATE_ONLY.includes("scripts/bootstrap.mjs") && TEMPLATE_ONLY.includes(".github/workflows/new-project.yml"));
});
