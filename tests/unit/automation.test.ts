import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { deployStats, ciStats, prStats, computeAlerts, mergeAlerts, dutyList, buildAutomation, renderBody, parseAutomationBody, HOUR, DAY } from "../../scripts/automation-core.mjs";

const NOW = Date.UTC(2026, 10, 20, 12, 0);
const dep = (agoH: number, over: Record<string, unknown> = {}) => ({ sha: "a".repeat(40), n: 2, at: NOW - agoH * HOUR, state: "READY", latencyMin: 10, ...over });

test("deployStats counts windows, medians, failures and a 7-day strip", () => {
  const s = deployStats([dep(1), dep(5, { latencyMin: 20 }), dep(30, { latencyMin: 30 }), dep(24 * 9), dep(2, { state: "ERROR", latencyMin: null })], NOW);
  assert.equal(s.last24h, 3);
  assert.equal(s.last7d, 4);
  assert.equal(s.failed7d, 1);
  assert.equal(s.commitsShipped7d, 8);
  assert.equal(s.medianCommitToLiveMin, 20);
  assert.equal(s.perDay.length, 7);
  assert.equal(s.perDay.reduce((n: number, d: { n: number }) => n + d.n, 0), 4);
  assert.equal(deployStats([], NOW).medianCommitToLiveMin, null);
});

test("ciStats ignores cancelled and old runs and counts reds and green-after-rerun", () => {
  const r = (conclusion: string, agoH: number, attempt = 1) => ({ conclusion, run_attempt: attempt, run_started_at: new Date(NOW - agoH * HOUR).toISOString(), updated_at: new Date(NOW - agoH * HOUR + 6 * 60e3).toISOString() });
  const s = ciStats([r("success", 1), r("failure", 2), r("success", 3, 2), r("cancelled", 4), r("success", 24 * 9)], NOW);
  assert.deepEqual(s, { runs7d: 3, red7d: 1, greenAfterRerun7d: 1, medianMin: 6 });
});

test("prStats", () => {
  const s = prStats([{ created_at: new Date(NOW - 3 * HOUR).toISOString(), merged_at: new Date(NOW - 2 * HOUR).toISOString() }, { created_at: new Date(NOW - 20 * DAY).toISOString(), merged_at: new Date(NOW - 19 * DAY).toISOString() }], [{ createdAt: new Date(NOW - 3 * HOUR).toISOString() }, { createdAt: new Date(NOW - 1 * HOUR).toISOString() }], [{}], NOW);
  assert.deepEqual(s, { merged7d: 1, medianOpenToMergeMin: 60, openNow: 2, openOver2h: 1, stuckNow: 1 });
});

const base = { now: NOW, tickAgeMin: 3, blockedUntil: 0, mainRed: null, redLive: null, stuck: [], doctor: [], reviewsDue: [], readErrors: [] };
const sha = "1234567890abcdef";

test("computeAlerts: nothing wrong means no alerts; each problem has the right severity", () => {
  assert.deepEqual(computeAlerts(base), []);
  const a = computeAlerts({ ...base, tickAgeMin: 90, mainRed: { sha, title: "t", url: "u" }, redLive: { sha, title: "t" }, stuck: [{ number: 7, reasons: ["conflict"] }], doctor: [{ name: "Vercel token", ok: false, detail: "HTTP 401" }, { name: "Supabase access token", ok: null }], reviewsDue: ["#164 Rules"], readErrors: ["ci runs"], blockedUntil: NOW + HOUR });
  const by = (k: string) => a.find((x: { kind: string }) => x.kind === k);
  assert.equal(by("red-live").severity, "critical");
  assert.equal(by("red-main").severity, "critical");
  assert.equal(by("actions-stale").severity, "critical");
  assert.equal(by("doctor").severity, "critical");
  assert.equal(by("stuck-pr").severity, "warn");
  assert.equal(by("deploy-blocked").severity, "warn");
  assert.equal(by("review-due").severity, "info");
  assert.equal(by("read-error").severity, "warn");
  assert.equal(a.filter((x: { kind: string }) => x.kind === "doctor").length, 1, "an unknown token check is not an alert");
  assert.equal(computeAlerts({ ...base, mainRed: { sha, title: "t", url: "u" } })[0].severity, "warn");
  assert.equal(computeAlerts({ ...base, tickAgeMin: 30 })[0].severity, "warn");
});

test("mergeAlerts keeps firstSeen while a condition lasts and moves cleared ones to recent", () => {
  const first = mergeAlerts(null, [{ id: "x", severity: "warn", headline: "h" }], "2026-11-20T10:00:00Z");
  const again = mergeAlerts(first, [{ id: "x", severity: "warn", headline: "h" }, { id: "y", severity: "critical", headline: "h2" }], "2026-11-20T10:30:00Z");
  assert.equal(again.open.find((a: { id: string }) => a.id === "x").firstSeen, "2026-11-20T10:00:00Z");
  assert.equal(again.open[0].id, "y", "critical first");
  const cleared = mergeAlerts(again, [], "2026-11-20T11:00:00Z");
  assert.equal(cleared.open.length, 0);
  assert.equal(cleared.recent.length, 2);
  assert.equal(cleared.recent[0].resolvedAt, "2026-11-20T11:00:00Z");
  const many = mergeAlerts({ open: [], recent: Array.from({ length: 40 }, (_, i) => ({ id: `r${i}` })) }, [], "t");
  assert.equal(many.recent.length, 30);
});

test("dutyList reflects tick age, doctor results and read errors", () => {
  const st = (h: object, id: string) => dutyList({ doctor: [], readErrors: [], ...h }).find((d: { id: string }) => d.id === id).status;
  assert.equal(st({ tickAgeMin: 3 }, "deploy"), "ok");
  assert.equal(st({ tickAgeMin: 30 }, "deploy"), "warn");
  assert.equal(st({ tickAgeMin: 90 }, "deploy"), "down");
  assert.equal(st({ tickAgeMin: 3, doctor: [{ name: "a", ok: true }] }, "tokens"), "ok");
  assert.equal(st({ tickAgeMin: 3, doctor: [{ name: "a", ok: false }] }, "tokens"), "down");
  assert.equal(st({ tickAgeMin: 3, doctor: [{ name: "a", ok: null }] }, "tokens"), "warn");
  assert.equal(st({ tickAgeMin: 3, readErrors: ["ci runs"] }, "ci-red"), "warn");
  assert.equal(st({}, "stale-red"), "planned");
});

test("duties describe only how things work now: no replaced-mechanism field and no old-way wording", () => {
  const text = JSON.stringify(dutyList({ tickAgeMin: 3, doctor: [], readErrors: [] }));
  assert.ok(!text.includes("replaces"));
  for (const w of ["manager", "watcher", "heartbeat", "supervisor", "used to", "no longer"]) assert.ok(!text.toLowerCase().includes(w), w);
});

test("the body round-trips through parseAutomationBody and rejects other versions", () => {
  const parts = { alertInputs: { ...base, doctor: [] }, deploys: deployStats([dep(1)], NOW), ci: ciStats([], NOW), prs: prStats([], [], [], NOW), process: { openRequests: 1, changesPending: 0, changesConfirmed: 0, changesMissed: 0, reviewsDue: [], rules: null } };
  const data = buildAutomation(parts, null, NOW);
  const body = renderBody(data);
  assert.deepEqual(parseAutomationBody(body), data);
  assert.equal(parseAutomationBody("no block"), null);
  assert.equal(parseAutomationBody(body.replace('"v":1', '"v":2')), null);
  assert.equal(parseAutomationBody(null), null);
});
