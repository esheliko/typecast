import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no types
import { parseStateBody, mayWriteState, rebuildDeploys, mergeDeploys } from "../../scripts/deploy-manager.mjs";

const good = { v: 1, ticks: 454, events: [], deploys: [{ id: "d1", sha: "a".repeat(40), at: 1, n: 3, state: "READY", latencyMin: 4 }] };
const body = (st: object) => `# Board\n\n<!--state ${JSON.stringify(st)} state-->`;

test("a readable state parses and keeps its history", () => {
  const r = parseStateBody(body(good));
  assert.equal(r.kind, "ok");
  assert.equal(r.st.ticks, 454);
  assert.equal(r.st.deploys.length, 1);
});
test("an empty body or an unparsable marker is 'bad': never a reason to write a blank state", () => {
  for (const b of ["", "   ", null, undefined, "<!--state {not json state-->", `<!--state ${JSON.stringify({ ticks: 1 })} state-->`]) {
    const r = parseStateBody(b as string);
    assert.equal(r.kind, "bad", String(b));
    assert.equal(mayWriteState(r), false);
  }
});
test("a failed API read ('error') must not allow a write", () => {
  assert.equal(mayWriteState({ kind: "error" }), false);
  assert.equal(mayWriteState(undefined), false);
});
test("a real body without the marker is genuinely missing: write allowed (rebuild)", () => {
  const r = parseStateBody("# Board\nsomething else");
  assert.equal(r.kind, "missing");
  assert.equal(mayWriteState(r), true);
  assert.equal(mayWriteState({ kind: "ok" }), true);
});

const vd = (id: string, sha: string, created: number, state = "READY", ready = created + 4 * 60e3, target = "production") => ({ id, sha, created, ready, state, target });
test("rebuildDeploys: newest first, mix and latency from git, previous deploy is the base", () => {
  const T = Date.parse("2026-11-13T10:00:00Z");
  const calls: Array<[string | null, string]> = [];
  const lookup = (prev: string | null, sha: string) => {
    calls.push([prev, sha]);
    return sha === "s2" ? [{ at: T + 20 * 60e3, files: ["src/app/page.tsx"] }, { at: T + 18 * 60e3, files: ["docs/x.md"] }] : [{ at: T - 60e3, files: ["src/a.ts"] }];
  };
  const out = rebuildDeploys([vd("d2", "s2", T + 30 * 60e3), vd("d1", "s1", T), vd("p", "sp", T, "READY", T, "preview"), vd("e", "s3", T + 40 * 60e3, "ERROR")], lookup);
  assert.deepEqual(out.map((x: { id: string }) => x.id), ["e", "d2", "d1"]);
  assert.deepEqual(calls, [[null, "s1"], ["s1", "s2"], ["s2", "s3"]]);
  const d2 = out[1];
  assert.equal(d2.n, 1);
  assert.equal(d2.mix, "1 production change, 1 no-effect");
  assert.equal(d2.latencyMin, 14); // ready at +34m, oldest relevant commit at +20m
});
test("rebuildDeploys: failed deploys have no latency; unknown commits do not crash; max respected", () => {
  const T = 1_000_000_000_000;
  const list = Array.from({ length: 5 }, (_, i) => vd(`d${i}`, `s${i}`, T + i * 1e6, i === 4 ? "ERROR" : "READY"));
  const out = rebuildDeploys(list, () => null, 3);
  assert.equal(out.length, 3);
  assert.equal(out[0].latencyMin, null);
  assert.equal(out[0].n, 1);
});
test("mergeDeploys: existing records win, rebuilt fill the gaps, newest first, capped", () => {
  const ex = [{ id: "a", at: 5, n: 9 }];
  const m = mergeDeploys(ex, [{ id: "a", at: 5, n: 1 }, { id: "b", at: 9, n: 1 }, { id: "c", at: 1, n: 1 }], 2);
  assert.deepEqual(m.map((x: { id: string }) => x.id), ["b", "a"]);
  assert.equal(m[1].n, 9);
});
