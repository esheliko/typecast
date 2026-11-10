import { test } from "node:test";
import assert from "node:assert/strict";
import { breadcrumb, cleanRecents, currentNode, emptyTrail, jumpTo, MAX_TRAIL, nodeId, nodeLabel, pushNode, startTrail, upsertRecent, type Node } from "../../src/lib/who-trail";

const p = (id: number, name = `P${id}`): Node => ({ t: "person", id, name, photo: null });
const t = (key: string, title = key): Node => ({ t: "title", key, title, year: "2000", poster: null });
const ep = (s: number, e: number): Node => ({ t: "episode", s, e });

test("labels and ids", () => {
  assert.equal(nodeLabel({ t: "root" }, "The Rookie S2E8"), "The Rookie S2E8");
  assert.equal(nodeLabel(ep(2, 8)), "S2E8");
  assert.equal(nodeId(ep(2, 8)), "ep2-8");
  assert.equal(nodeLabel({ t: "pair", a: { id: 1, name: "A", photo: null }, b: { id: 2, name: "B", photo: null } }), "A & B");
});

test("pushing extends the trail; the same node twice does nothing", () => {
  let s = emptyTrail("b1");
  s = pushNode(s, p(1), "b2");
  s = pushNode(s, t("tv:5"), "b3");
  assert.deepEqual(s.nodes.map(nodeId), ["p1", "tv:5"]);
  assert.equal(s.cur, 2);
  assert.equal(s.branch, "b1");
  assert.equal(pushNode(s, t("tv:5"), "bx"), s);
  assert.equal(currentNode(s).t, "title");
});

test("going back keeps the later steps; choosing the same next step just moves on", () => {
  let s = startTrail([p(1), t("tv:5"), p(2)], "b1");
  s = jumpTo(s, 1);
  assert.equal(s.nodes.length, 3, "nothing is erased");
  assert.equal(currentNode(s).t, "person");
  s = pushNode(s, t("tv:5"), "b2");
  assert.equal(s.cur, 2);
  assert.equal(s.nodes.length, 3, "the step after it is still there");
  assert.equal(s.branch, "b1");
  assert.equal(currentNode(jumpTo(s, 0)).t, "root");
  assert.equal(jumpTo(s, 99), s);
});

test("opening the step right before the current one is just going back; further back is a new step", () => {
  let s = startTrail([p(1), t("tv:5"), p(2)], "b1");
  s = pushNode(s, t("tv:5"), "b2");
  assert.equal(s.cur, 2, "one before: back");
  assert.equal(s.nodes.length, 3);
  assert.equal(s.branch, "b1");
  s = startTrail([p(1), t("tv:5"), p(2)], "b1");
  s = pushNode(s, p(1), "b3");
  assert.deepEqual(s.nodes.map(nodeId), ["p1", "tv:5", "p2", "p1"], "two back is a new step");
});

test("a new step chosen from an earlier one replaces what was ahead and starts a new branch", () => {
  let s = startTrail([p(1), t("tv:5"), p(2)], "b1");
  s = jumpTo(s, 1);
  s = pushNode(s, t("movie:9"), "b2");
  assert.deepEqual(s.nodes.map(nodeId), ["p1", "movie:9"]);
  assert.equal(s.cur, 2);
  assert.equal(s.branch, "b2");
});

test("the trail is capped", () => {
  let s = emptyTrail("b");
  for (let i = 1; i <= MAX_TRAIL + 5; i++) s = pushNode(s, p(i), "x");
  assert.equal(s.nodes.length, MAX_TRAIL);
  assert.equal(s.cur, MAX_TRAIL);
  assert.equal(nodeId(s.nodes[MAX_TRAIL - 1]), `p${MAX_TRAIL + 5}`);
});

test("recents: one entry per branch, newest first, no identical lines twice", () => {
  let l = upsertRecent([], { id: "b1", k: "tv:1", nodes: [p(1)] });
  l = upsertRecent(l, { id: "b2", k: "tv:1", nodes: [p(2)] });
  l = upsertRecent(l, { id: "b1", k: "tv:1", nodes: [p(1), t("tv:5")] });
  assert.deepEqual(l.map((r) => r.id), ["b1", "b2"]);
  assert.equal(l[0].nodes.length, 2, "the same branch is updated in place as it grows");
  l = upsertRecent(l, { id: "b3", k: "tv:1", nodes: [p(2)] });
  assert.deepEqual(l.map((r) => r.id), ["b3", "b1"], "an identical line replaces the older one");
  assert.deepEqual(upsertRecent(l, { id: "e", k: "tv:1", nodes: [] }), l);
  assert.equal(upsertRecent(Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, k: "k", nodes: [p(i)] })), { id: "n", k: "k", nodes: [p(99)] }).length, 8);
});

test("breadcrumb text and stored-data cleanup", () => {
  assert.equal(breadcrumb([p(1, "Sara Rue"), t("tv:5", "The Big Bang Theory"), ep(2, 8)]), "Sara Rue > The Big Bang Theory > S2E8");
  const good = { id: "a", k: "tv:1", nodes: [p(1)] };
  assert.deepEqual(cleanRecents([good, { id: 1 }, { id: "x", k: "k", nodes: [{ t: "person" }] }, null, "x"]), [good]);
  assert.deepEqual(cleanRecents("nope"), []);
});
