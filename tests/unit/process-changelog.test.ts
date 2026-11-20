import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error plain .mjs script, no types
import { parseChangelog, validateChangelog, dueReviews } from "../../scripts/process-changelog.mjs";

const entry = (date: string, over: Record<string, string> = {}) => {
  const f = { What: "w", Why: "y", "Expected effect": "e", "Review by": "2026-12-04", Status: "pending", ...over };
  return `## ${date} · #1 · Title\n` + Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n";
};

test("parses entries and fields; ignores prose before the first entry", () => {
  const e = parseChangelog("intro\n\n" + entry("2026-11-20") + "\n" + entry("2026-11-19", { Status: "confirmed" }));
  assert.equal(e.length, 2);
  assert.equal(e[0].fields["Expected effect"], "e");
  assert.equal(e[1].fields.Status, "confirmed");
  assert.deepEqual(validateChangelog(e), []);
});

test("validation names order, missing fields, bad status and a pending change without a review date", () => {
  const p = validateChangelog(parseChangelog(entry("2026-11-19") + entry("2026-11-20", { Status: "weird" }) + entry("2026-11-18", { "Review by": "n/a" }) + "## 2026-11-17 · #9 · Bare\nWhat: x\n"));
  assert.ok(p.some((m: string) => m.includes("newest first")));
  assert.ok(p.some((m: string) => m.includes("Status must be")));
  assert.ok(p.some((m: string) => m.includes("needs a Review by")));
  assert.ok(p.some((m: string) => m.includes('missing "Why:"')));
  assert.deepEqual(validateChangelog([]), ["no entries"]);
});

test("dueReviews lists only pending entries whose date has passed", () => {
  const e = parseChangelog(entry("2026-11-20") + entry("2026-11-10", { Status: "confirmed", "Review by": "2026-11-12" }) + entry("2026-11-01", { "Review by": "2026-11-15" }));
  assert.deepEqual(dueReviews(e, "2026-12-04").map((x: { date: string }) => x.date), ["2026-11-20", "2026-11-01"]);
  assert.deepEqual(dueReviews(e, "2026-11-16").map((x: { date: string }) => x.date), ["2026-11-01"]);
});

test("the checked-in process/CHANGELOG.md is well formed", () => {
  assert.deepEqual(validateChangelog(parseChangelog(readFileSync("process/CHANGELOG.md", "utf8"))), []);
});
