import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { ciVerdict, markRelevant } from "../../scripts/deploy-manager.mjs";

const run = (o: object) => ({ name: "verify", started_at: "2026-01-01T00:00:00Z", status: "completed", conclusion: "success", ...o });

test("no verify check means CI never ran: do not block", () => {
  assert.equal(ciVerdict([]), "none");
  assert.equal(ciVerdict([{ name: "other", status: "completed", conclusion: "failure" }]), "none");
});
test("success, neutral and skipped pass; anything else fails", () => {
  for (const c of ["success", "neutral", "skipped"]) assert.equal(ciVerdict([run({ conclusion: c })]), "pass", c);
  for (const c of ["failure", "timed_out", "action_required"]) assert.equal(ciVerdict([run({ conclusion: c })]), "fail", c);
});
test("a just-cancelled (superseded) run is pending, not a failure", () => {
  const now = Date.parse("2026-01-01T00:01:00Z");
  assert.equal(ciVerdict([run({ conclusion: "cancelled", completed_at: "2026-01-01T00:00:30Z" })], now), "pending");
});
test("a cancelled run with nothing after it for minutes no longer blocks", () => {
  const now = Date.parse("2026-01-01T00:20:00Z");
  assert.equal(ciVerdict([run({ conclusion: "cancelled", completed_at: "2026-01-01T00:00:30Z" })], now), "none");
});
test("a running check is pending", () => assert.equal(ciVerdict([run({ status: "in_progress", conclusion: null })]), "pending"));
test("the newest run wins (a re-run fixes an earlier failure)", () => {
  assert.equal(ciVerdict([run({ conclusion: "failure" }), run({ started_at: "2026-01-01T01:00:00Z" })]), "pass");
});

const cm = (sha: string, files: string[]) => ({ sha, files, at: 0, subject: sha, urgent: false });
test("docs, scripts and tests never need a deploy", () => {
  const r = markRelevant([cm("a", ["DEPLOYING.md", "scripts/x.mjs", "tests/unit/a.test.ts"])], ["DEPLOYING.md", "scripts/x.mjs", "tests/unit/a.test.ts"]);
  assert.equal(r.filter((c: { relevant: boolean }) => c.relevant).length, 0);
});
test("an edit and its revert cancel out: nothing to deploy", () => {
  const r = markRelevant([cm("rev", ["src/a.tsx"]), cm("edit", ["src/a.tsx"])], []);
  assert.equal(r.filter((c: { relevant: boolean }) => c.relevant).length, 0);
});
test("a site file that still differs is relevant, and so is an unknown file", () => {
  assert.equal(markRelevant([cm("a", ["src/a.tsx", "README.md"])], ["src/a.tsx", "README.md"])[0].relevant, true);
  assert.equal(markRelevant([cm("a", ["tailwind.config.ts"])], ["tailwind.config.ts"])[0].relevant, true);
});

test("a head commit with no verify check yet is pending only for the first minutes", () => {
  const now = Date.parse("2026-01-01T00:10:00Z");
  assert.equal(ciVerdict([], now, now - 30_000), "pending");
  assert.equal(ciVerdict([], now, now - 20 * 60_000), "none");
  assert.equal(ciVerdict([], now), "none");
});

// @ts-expect-error plain .mjs script, no types
import { parseFailures, rankSuspects } from "../../scripts/ci-status.mjs";
test("parseFailures reads Playwright's failure list", () => {
  const txt = "  2 failed\n    tests/smoke/smoke.spec.ts:181:3 › signed in › a note is saved \n    tests/smoke/behaviour.spec.ts:145:3 › behaviour › popup mark ─────────\n  31 passed";
  assert.deepEqual(parseFailures([txt]), ["tests/smoke/smoke.spec.ts › signed in › a note is saved", "tests/smoke/behaviour.spec.ts › behaviour › popup mark"]);
});
test("rankSuspects puts the commit touching the failing area first", () => {
  const r = rankSuspects(["tests/smoke/smoke.spec.ts › signed in › a note typed before leaving the title is saved"], [
    { sha: "a", subject: "Tidy stats colours", session: "s1", files: ["src/components/Stats.tsx"] },
    { sha: "b", subject: "Title view: flush pending notes before leaving", session: "s2", files: ["src/components/TitleView.tsx"] },
  ]);
  assert.equal(r[0].sha, "b");
});
