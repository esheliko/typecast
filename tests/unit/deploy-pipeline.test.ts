import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { branchKind, inMainState, tipCoveredByPr, pipelineDigest, prOfSubject, prStage, renderPipeline } from "../../scripts/deploy-manager.mjs";

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
  const md = renderPipeline({ prs: [pr({ number: 2, ci: "fail" }), pr({ number: 1 })], branches: [{ name: "claude/x", ahead: 3, at: 0, files: 2, inMain: "partly" }], mergedLeft: 5, inMainLeft: 1, pendingMerged: 2 }, 3600e3).join("\n");
  assert.match(md, /2 open PRs/);
  assert.match(md, /waiting to deploy: \*\*2\*\*/);
  assert.ok(md.indexOf("#1") < md.indexOf("#2"));
  assert.match(md, /claude\/x/);
  assert.match(md, /3 commits ahead of main · 2 files · already in main: partly/);
  assert.match(md, /- 5 merged branches not deleted/);
  assert.match(md, /- 1 branch with no PR whose changes are already in main/);
});
test("renderPipeline: a PR row carries the 🔵/⚪/❓ marker from its files", () => {
  const row = (files: string[] | undefined) => renderPipeline({ prs: [pr({ files })], branches: [], pendingMerged: 0 }, 0).find((l: string) => l.startsWith("| [#"))!;
  assert.match(row(["src/app/page.tsx"]), /\| 🔵 \|/);
  assert.match(row(["docs/a.md", "scripts/x.mjs"]), /\| ⚪ \|/);
  assert.match(row(["docs/a.md", "src/lib/x.ts"]), /\| 🔵 \|/); // both touched = production
  assert.match(row([]), /\| ❓ \|/);
  assert.match(row(undefined), /\| ❓ \|/);
});
test("branchKind: any PR state keeps a branch off the loose list (squash-merge leaves merged branches ahead of main)", () => {
  const m = new Map([["a", new Set(["closed"])], ["b", new Set(["open"])], ["c", new Set(["closed", "open"])]]);
  assert.equal(branchKind("none", m), "loose");
  assert.equal(branchKind("a", m), "merged");
  assert.equal(branchKind("b", m), "open");
  assert.equal(branchKind("c", m), "open");
});
test("inMainState: same blobs on main = yes, none = no, some = partly, removed file absent on main = same", () => {
  const f = [{ filename: "a", status: "modified", sha: "1" }, { filename: "b", status: "added", sha: "2" }];
  assert.equal(inMainState(f, new Map([["a", "1"], ["b", "2"]])), "yes");
  assert.equal(inMainState(f, new Map([["a", "1"], ["b", "x"]])), "partly");
  assert.equal(inMainState(f, new Map()), "no");
  assert.equal(inMainState([{ filename: "g", status: "removed", sha: "0" }], new Map()), "yes");
  assert.equal(inMainState([{ filename: "g", status: "removed", sha: "0" }], new Map([["g", "present"]])), "no");
  assert.equal(inMainState([], new Map()), "yes");
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
test("tipCoveredByPr: a merged or open PR containing the tip covers it; none or only a closed-unmerged PR does not", () => {
  assert.equal(tipCoveredByPr([{ state: "closed", merged_at: "2026-11-12T20:49:41Z" }]), true);
  assert.equal(tipCoveredByPr([{ state: "open", merged_at: null }]), true);
  assert.equal(tipCoveredByPr([{ state: "closed", merged_at: null }]), false);
  assert.equal(tipCoveredByPr([]), false);
  assert.equal(tipCoveredByPr(undefined), false);
});
test("renderPipeline: a failed part says so and the other part still renders (degrades per part)", () => {
  const noPrs = renderPipeline({ prs: null, branches: [{ name: "claude/x", ahead: 1, at: 0, files: 1, inMain: "no" }], mergedLeft: 0, inMainLeft: 0, pendingMerged: 3 }, 3600e3).join("\n");
  assert.match(noPrs, /Open PRs unavailable this tick/);
  assert.match(noPrs, /claude\/x/);
  assert.doesNotMatch(noPrs, /Nothing in flight/);
  const noBranches = renderPipeline({ prs: [pr({ number: 7 })], branches: null, pendingMerged: 0 }, 3600e3).join("\n");
  assert.match(noBranches, /1 open PR/);
  assert.match(noBranches, /Branch data unavailable this tick/);
  assert.notEqual(pipelineDigest({ prs: [], branches: [], pendingMerged: 0 }), pipelineDigest({ prs: null, branches: [], pendingMerged: 0 }));
});
