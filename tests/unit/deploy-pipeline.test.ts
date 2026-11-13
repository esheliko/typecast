import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { pipelineDigest, prOfSubject, prStage, renderPipeline } from "../../scripts/deploy-manager.mjs";

const pr = (o: object = {}) => ({ number: 7, title: "T", branch: "b", author: "a", at: 0, ci: "pass", draft: false, mergeable: true, mergeableState: "clean", ...o });

test("prStage: green and clean is ready, behind main needs an update first", () => {
  assert.equal(prStage(pr()), "ready");
  assert.equal(prStage(pr({ mergeableState: "behind" })), "behind");
});
test("prStage: red, running and missing CI are told apart", () => {
  assert.equal(prStage(pr({ ci: "fail" })), "red");
  assert.equal(prStage(pr({ ci: "pending" })), "running");
  assert.equal(prStage(pr({ ci: "none" })), "unverified");
});
test("prStage: conflicts and drafts win over CI", () => {
  assert.equal(prStage(pr({ mergeable: false })), "conflicts");
  assert.equal(prStage(pr({ draft: true, ci: "fail" })), "draft");
});
test("prOfSubject reads the squash-merge number", () => {
  assert.equal(prOfSubject("Fix thing (#12)"), 12);
  assert.equal(prOfSubject("Fix thing"), null);
});
test("renderPipeline: summary, ready PRs first, loose branches", () => {
  const md = renderPipeline({ prs: [pr({ number: 2, ci: "fail" }), pr({ number: 1 })], branches: [{ name: "claude/x", ahead: 3, at: 0 }], pendingMerged: 2 }, 3600e3).join("\n");
  assert.match(md, /2 open PRs/);
  assert.match(md, /waiting to deploy: \*\*2\*\*/);
  assert.ok(md.indexOf("#1") < md.indexOf("#2"));
  assert.match(md, /claude\/x/);
});
test("renderPipeline: missing data and empty pipeline are said plainly", () => {
  assert.match(renderPipeline(null, 0).join("\n"), /unavailable/);
  assert.match(renderPipeline({ prs: [], branches: [], pendingMerged: 0 }, 0).join("\n"), /Nothing in flight/);
});
test("pipelineDigest ignores age but sees a stage change", () => {
  const a = { prs: [pr({ at: 1 })], branches: [], pendingMerged: 0 };
  assert.equal(pipelineDigest(a), pipelineDigest({ ...a, prs: [pr({ at: 999 })] }));
  assert.notEqual(pipelineDigest(a), pipelineDigest({ ...a, prs: [pr({ ci: "fail" })] }));
});
