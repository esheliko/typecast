import test from "node:test";
import assert from "node:assert/strict";
import { crumbLabel, jumpBy, relabel, showTrail, trailStart, visit, type TrailStep } from "../../src/lib/trail";

const s = (u: string): TrailStep => ({ url: u, label: u });

test("new steps append and move the position", () => {
  let t = trailStart(s("/a"));
  t = visit(t, s("/b"));
  t = visit(t, s("/c"));
  assert.deepEqual(t.steps.map((x) => x.url), ["/a", "/b", "/c"]);
  assert.equal(t.i, 2);
});

test("the same url again changes nothing", () => {
  const t = visit(trailStart(s("/a")), s("/b"));
  assert.equal(visit(t, s("/b")), t);
});

test("Back and Forward by one move the position and keep the steps", () => {
  let t = visit(visit(trailStart(s("/a")), s("/b")), s("/c"));
  t = visit(t, s("/b"));
  assert.equal(t.i, 1);
  assert.equal(t.steps.length, 3);
  t = visit(t, s("/c"));
  assert.equal(t.i, 2);
});

test("a jump keeps the steps ahead reachable", () => {
  let t = visit(visit(visit(trailStart(s("/a")), s("/b")), s("/c")), s("/d"));
  assert.equal(jumpBy(t, 0), -3);
  t = visit(t, s("/a"), 0);
  assert.equal(t.i, 0);
  assert.equal(t.steps.length, 4);
  assert.equal(jumpBy(t, 3), 3);
});

test("a jump onto a repeated url lands on the chosen step, not the last match", () => {
  let t = trailStart(s("/a"));
  for (const u of ["/b", "/c", "/a"]) t = visit(t, s(u));
  assert.equal(t.i, 3);
  t = visit(t, s("/a"), 0);
  assert.equal(t.i, 0);
});

test("a new step after going back drops what was ahead", () => {
  let t = visit(visit(visit(trailStart(s("/a")), s("/b")), s("/c")), s("/b"));
  t = visit(t, s("/x"));
  assert.deepEqual(t.steps.map((x) => x.url), ["/a", "/b", "/x"]);
  assert.equal(t.i, 2);
});

test("shown from the third step on only", () => {
  let t = trailStart(s("/a"));
  assert.equal(showTrail(t), false);
  t = visit(t, s("/b"));
  assert.equal(showTrail(t), false);
  t = visit(t, s("/c"));
  assert.equal(showTrail(t), true);
});

test("jumpBy ignores steps that do not exist", () => {
  const t = visit(trailStart(s("/a")), s("/b"));
  assert.equal(jumpBy(t, 5), 0);
  assert.equal(jumpBy(t, -1), 0);
});

test("relabel fixes the current step only", () => {
  const t = visit(trailStart(s("/a")), s("/b"));
  const r = relabel(t, " Heat ");
  assert.equal(r.steps[1].label, "Heat");
  assert.equal(r.steps[0].label, "/a");
  assert.equal(relabel(r, "Heat"), r);
  assert.equal(relabel(r, "  "), r);
});

test("crumbLabel trims, collapses space and truncates", () => {
  assert.equal(crumbLabel("  a   b "), "a b");
  assert.equal(crumbLabel("x".repeat(60)).length, 40);
  assert.ok(crumbLabel("x".repeat(60)).endsWith("…"));
  assert.equal(crumbLabel(""), "…");
});
