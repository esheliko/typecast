import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain .mjs script, no types
import { ciDecision, watchStatus, guardLines, LIMITS, readReported, writeReported } from "../../scripts/manager-watch.mjs";
// @ts-expect-error plain .mjs script, no types
import { parseRed } from "../../scripts/ci-watch.mjs";

test("green and unfinished CI stay quiet", () => {
  assert.equal(ciDecision(null, new Set()), "wait");
  assert.equal(ciDecision({ sha: "a", ok: true }, new Set()), "ok");
});
test("a red is reported once, never twice", () => {
  const seen = new Set<string>();
  assert.equal(ciDecision({ sha: "a", ok: false }, seen), "red");
  seen.add("a");
  assert.equal(ciDecision({ sha: "a", ok: false }, seen), "wait");
  assert.equal(ciDecision({ sha: "b", ok: false }, seen), "red");
});
const base = { startedAt: 0, lastCiOk: 0, lastGuardOk: 0, guardTicks: 57, deploys: 3 };
test("keeps running while both sources are fresh", () => {
  assert.equal(watchStatus({ ...base, now: 100 * 60e3, lastCiOk: 99 * 60e3, lastGuardOk: 98 * 60e3 }).done, false);
});
test("rearms after 115 minutes with the counts", () => {
  const s = watchStatus({ ...base, now: 115 * 60e3, lastCiOk: 114 * 60e3, lastGuardOk: 114 * 60e3 });
  assert.equal(s.line, "REARM manager-watch (no red, 57 guard ticks, 3 deploys)");
  assert.ok(LIMITS.rearmAfterMs < 120 * 60e3);
});
test("silence over 10 minutes is a WATCH_ERROR naming the source", () => {
  assert.match(watchStatus({ ...base, now: 11 * 60e3, lastCiOk: 10 * 60e3, lastGuardOk: 0 }).line, /^WATCH_ERROR cannot read deploy manager for 11 min$/);
  assert.match(watchStatus({ ...base, now: 12 * 60e3, lastCiOk: 1 * 60e3, lastGuardOk: 12 * 60e3 }).line, /^WATCH_ERROR cannot read CI for 11 min$/);
  assert.equal(watchStatus({ ...base, now: 9 * 60e3, lastCiOk: null, lastGuardOk: null }).done, false); // never read yet counts from start
  assert.match(watchStatus({ ...base, now: 11 * 60e3, lastCiOk: null, lastGuardOk: 11 * 60e3 }).line, /CI/);
});
test("only DEPLOYING lines are logged, stamped in IST", () => {
  const l = guardLines("noise\nDEPLOYING abc1234 (2 commits): quiet\nmore", new Date("2026-11-13T10:30:00Z"));
  assert.deepEqual(l, ["GUARD_DEPLOYED 12:30 IST :: DEPLOYING abc1234 (2 commits): quiet"]);
});
test("parseRed builds the CI_RED line", () => {
  const out = "x\n::owner=session_1\n- tests/smoke/a.spec.ts › one\n- tests/smoke/b.spec.ts › two\n";
  assert.equal(parseRed(out, "0123456789"), "CI_RED 0123456 owner=session_1 tests=2 :: a.spec.ts › one | b.spec.ts › two");
  assert.equal(parseRed("", "0123456789"), "CI_RED 0123456 owner=none tests=0 :: ");
});
test("process: red exits 0 with one line and leaves no child; a fake deploy is logged to the file", () => {
  const dir = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
  const r = spawnSync("node", ["scripts/manager-watch.mjs"], {
    encoding: "utf8", timeout: 20000,
    env: { ...process.env, TMPDIR: dir, MANAGER_WATCH_SCALE: "100",
      MANAGER_WATCH_DEPLOY_CMD: JSON.stringify(["echo", "DEPLOYING abc1234 (1 commit): fake"]),
      MANAGER_WATCH_CI_CMD: JSON.stringify(["echo", "deadbeefcafe red"]) },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "CI_RED deadbee owner=none tests=0 :: \n");
});
test("process: green main + fake deploy stays silent until REARM, deploy goes to the log", () => {
  const dir = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
  const r = spawnSync("node", ["scripts/manager-watch.mjs"], {
    encoding: "utf8", timeout: 30000,
    env: { ...process.env, TMPDIR: dir, MANAGER_WATCH_SCALE: "3000", // 115 min -> ~2.3 s, guard every 40 ms
      MANAGER_WATCH_DEPLOY_CMD: JSON.stringify(["echo", "DEPLOYING abc1234 (1 commit): fake"]),
      MANAGER_WATCH_CI_CMD: JSON.stringify(["echo", "deadbeefcafe ok"]) },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^REARM manager-watch \(no red, \d+ guard ticks, \d+ deploys\)\n$/);
  const log = execFileSync("cat", [`${dir}/manager-watch.log`], { encoding: "utf8" });
  assert.match(log, /^GUARD_DEPLOYED \d\d:\d\d IST :: DEPLOYING abc1234/);
});
test("process: unreadable CI/deploy command ends in WATCH_ERROR", () => {
  const r = spawnSync("node", ["scripts/manager-watch.mjs"], {
    encoding: "utf8", timeout: 30000,
    env: { ...process.env, MANAGER_WATCH_SCALE: "1000", MANAGER_WATCH_DEPLOY_CMD: JSON.stringify(["false"]), MANAGER_WATCH_CI_CMD: JSON.stringify(["false"]) },
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^WATCH_ERROR cannot read /);
});

test("the last reported red survives a restart: same sha quiet, new sha reported", () => {
  const f = join(mkdtempSync(join(tmpdir(), "mw-")), "red");
  assert.equal(readReported(f), null);
  writeReported(f, "abc");
  const seen = new Set([readReported(f)]);
  assert.equal(ciDecision({ sha: "abc", ok: false }, seen), "wait");
  assert.equal(ciDecision({ sha: "def", ok: false }, seen), "red");
});

// @ts-expect-error plain .mjs script, no types
import { staleRedPrs, staleLine, verifyVerdict } from "../../scripts/stale-red-prs.mjs";
const pr = (number: number, o = {}) => ({ number, head: `h${number}`, verify: "red", contains: false, ...o });
test("stale PRs: red or unverified without the fix, once per head", () => {
  const c = [pr(34), pr(33), pr(35, { contains: true }), pr(36, { verify: "ok" }), pr(37, { verify: "none" }), pr(38, { verify: "pending" })];
  assert.deepEqual(staleRedPrs(c, new Set()).map((p: { number: number }) => p.number), [33, 34, 37]);
  assert.deepEqual(staleRedPrs(c, new Set(["33@h33", "34@h34"])).map((p: { number: number }) => p.number), [37]);
  assert.deepEqual(staleRedPrs([pr(33, { head: "new" })], new Set(["33@h33"])).length, 1); // new head is reported again
});
test("STALE_RED_PRS line, with optional sessions, null when empty", () => {
  assert.equal(staleLine([pr(33), pr(34)], "0123456789"), "STALE_RED_PRS #33,#34 (main green again at 0123456)");
  assert.equal(staleLine([pr(33, { session: "session_a" })], "0123456789"), "STALE_RED_PRS #33 (main green again at 0123456) sessions=#33:session_a");
  assert.equal(staleLine([], "x"), null);
});
test("verifyVerdict reads the newest verify run", () => {
  assert.equal(verifyVerdict([]), "none");
  assert.equal(verifyVerdict([{ name: "verify", status: "in_progress", started_at: "2026-01-01" }]), "pending");
  assert.equal(verifyVerdict([{ name: "verify", status: "completed", conclusion: "failure", started_at: "2026-01-01" }, { name: "verify", status: "completed", conclusion: "success", started_at: "2026-01-02" }]), "ok");
  assert.equal(verifyVerdict([{ name: "verify", status: "completed", conclusion: "failure", started_at: "2026-01-02" }]), "red");
});
test("process: green after a red period prints STALE_RED_PRS once, then stays quiet", () => {
  const dir = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
  execFileSync("sh", ["-c", `echo deadbeef > ${dir}/manager-watch-recover`]);
  const env = { ...process.env, TMPDIR: dir, MANAGER_WATCH_SCALE: "3000", MANAGER_WATCH_DEPLOY_CMD: JSON.stringify(["true"]),
    MANAGER_WATCH_CI_CMD: JSON.stringify(["echo", "cafebabe1234 ok"]),
    MANAGER_WATCH_STALE_CMD: JSON.stringify(["echo", JSON.stringify([pr(33, { session: "session_a" }), pr(34)])]) };
  const r = spawnSync("node", ["scripts/manager-watch.mjs"], { encoding: "utf8", timeout: 30000, env });
  assert.equal(r.stdout, "STALE_RED_PRS #33,#34 (main green again at cafebab) sessions=#33:session_a\n");
  const r2 = spawnSync("node", ["scripts/manager-watch.mjs"], { encoding: "utf8", timeout: 30000, env });
  assert.match(r2.stdout, /^REARM/);
});
