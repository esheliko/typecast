import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { BOARD_CONTRACT as C, render } from "../../scripts/deploy-manager.mjs";

const HELP =
  "The deploy board artifact parses issue #1 text. See DEPLOYING.md > 'Visual board'. Update the artifact in the same task (ArtifactData on files/index.html) and BOARD_CONTRACT in scripts/deploy-manager.mjs.";
const all = (re: RegExp, s: string) => [...s.matchAll(new RegExp(re.source, re.flags))];

const now = Date.parse("2026-11-13T12:00:00Z");
const st = {
  ticks: 5,
  lastWrite: now - 1000,
  deploys: [
    { id: "d", sha: "abcdef1234", n: 3, mix: "1 production change, 2 no-effect", firstAt: now, at: now, state: "READY", latencyMin: 7, error: null },
  ],
  events: [{ t: now, kind: "ready", msg: "abcdef1 READY" }],
};
const ctx = {
  now,
  ready: { sha: "abcdef1234", created: now - 600e3 },
  pipeline: {
    prs: [{ number: 12, title: "Fix a thing", branch: "claude/fix", author: "a", at: now - 3600e3, ci: "pass", draft: false, mergeable: true, mergeableState: "clean" }],
    branches: [{ name: "claude/loose", ahead: 2, at: now - 7200e3 }],
    pendingMerged: 1,
  },
};
const d = { action: "hold", why: "batching", used: 1, spendable: 3, free: 1, dueAt: now };
const pending = {
  relevant: [{ sha: "1111111aaaa", subject: "Site change (#9)", at: now - 120e3 }],
  markers: [
    { sha: "1111111aaaa", marker: "🔵" },
    { sha: "2222222bbbb", marker: "⚪" },
    { sha: "3333333cccc", marker: "❓" },
  ],
};
const md: string = render(st, ctx, d, pending);

test("board format: manager headline and reason", () => {
  const m = md.match(C.headline);
  assert.ok(m, HELP);
  assert.equal(m[1], "HOLDING (batching pushes)", HELP);
  assert.match(m[2], /^batching/, HELP);
});
test("board format: waiting-to-deploy commit lines", () => {
  const m = all(C.pendingCommit, md);
  assert.equal(m.length, 1, HELP);
  assert.equal(m[0][1], "1111111", HELP);
});
test("board format: pipeline summary, PR rows and loose branches", () => {
  const s = md.match(C.pipelineSummary);
  assert.ok(s, HELP);
  assert.deepEqual([s[1], s[3]], ["1", "1"], HELP);
  const prs = all(C.pipelinePr, md);
  assert.equal(prs.length, 1, HELP);
  assert.deepEqual([prs[0][1], prs[0][3], prs[0][5]], ["12", "claude/fix", "green"], HELP);
  const b = all(C.pipelineBranch, md);
  assert.equal(b.length, 1, HELP);
  assert.deepEqual([b[0][1], b[0][2]], ["claude/loose", "2"], HELP);
});
test("board format: commit markers section and lines", () => {
  assert.match(md, /^### Commit markers \(last 3 on main\)$/m, HELP);
  assert.deepEqual(all(C.marker, md).map((m) => m[2]), ["🔵", "⚪", "❓"], HELP);
});
test("board format: state JSON with deployments (mix) and events", () => {
  const m = md.match(C.state);
  assert.ok(m, HELP);
  const parsed = JSON.parse(m[1]);
  const x = parsed.deploys[0];
  assert.deepEqual([x.sha, x.n, x.latencyMin, x.state, x.mix], ["abcdef1234", 3, 7, "READY", "1 production change, 2 no-effect"], HELP);
  assert.deepEqual([parsed.events[0].kind, parsed.events[0].msg, typeof parsed.lastWrite], ["ready", "abcdef1 READY", "number"], HELP);
});
test("board format: section headings the board relies on", () => {
  for (const h of ["### Pipeline", "### Merged to main, waiting to deploy", "### Recent deployments", "### Events"]) {
    assert.ok(md.includes(h), `missing heading ${h}. ${HELP}`);
  }
});
