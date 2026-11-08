import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { ciVerdict } from "../../scripts/deploy-manager.mjs";

const run = (o: object) => ({ name: "verify", started_at: "2026-01-01T00:00:00Z", status: "completed", conclusion: "success", ...o });

test("no verify check means CI never ran: do not block", () => {
  assert.equal(ciVerdict([]), "none");
  assert.equal(ciVerdict([{ name: "other", status: "completed", conclusion: "failure" }]), "none");
});
test("success, neutral and skipped pass; anything else fails", () => {
  for (const c of ["success", "neutral", "skipped"]) assert.equal(ciVerdict([run({ conclusion: c })]), "pass", c);
  for (const c of ["failure", "timed_out", "action_required"]) assert.equal(ciVerdict([run({ conclusion: c })]), "fail", c);
});
test("a cancelled (superseded) run is pending, not a failure", () => assert.equal(ciVerdict([run({ conclusion: "cancelled" })]), "pending"));
test("a running check is pending", () => assert.equal(ciVerdict([run({ status: "in_progress", conclusion: null })]), "pending"));
test("the newest run wins (a re-run fixes an earlier failure)", () => {
  assert.equal(ciVerdict([run({ conclusion: "failure" }), run({ started_at: "2026-01-01T01:00:00Z" })]), "pass");
});
