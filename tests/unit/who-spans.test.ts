import { test } from "node:test";
import assert from "node:assert/strict";
import { runLabel, showRunLabel, spanFromEpisodes, yearSpan } from "../../src/lib/who-spans";

const show = { first: "2007-09-24", last: "2019-05-16" };
const eps = [{ s: 2, e: 9, air: "2008-11-24" }, { s: 2, e: 8, air: "2008-11-17" }, { s: 2, e: 10, air: "2008-12-08" }];

test("a person's own episode dates beat the show's years", () => {
  const s = spanFromEpisodes("tv:1418", eps, 3, show)!;
  assert.equal(s.kind, "own");
  assert.equal(s.start, "2008-11-17");
  assert.equal(s.end, "2008-12-08");
  assert.equal(s.n, 3);
  assert.deepEqual(s.eps.map((x) => x.e), [8, 9, 10], "sorted by air date");
});

test("no episode list: the show's run, flagged, with no own dates", () => {
  const s = spanFromEpisodes("tv:1", [], 145, show)!;
  assert.equal(s.kind, "run");
  assert.equal(s.start, "2007-09-24");
  assert.equal(s.n, 0);
});

test("a short list for a regular says nothing about when they started: falls back to the run", () => {
  assert.equal(spanFromEpisodes("tv:1", [eps[0]], 145, show)!.kind, "run");
  assert.equal(spanFromEpisodes("tv:1", eps, 3, show)!.kind, "own");
  assert.equal(spanFromEpisodes("tv:1", [], 0, null), null, "nothing at all");
});

test("episodes with no air date are not dates", () => {
  assert.equal(spanFromEpisodes("tv:1", [{ s: 1, e: 1, air: "" }], 1, null), null);
});

test("the show being watched is clipped to the position: nothing later is given away", () => {
  const rookie = [{ s: 1, e: 5, air: "2018-11-13" }, { s: 2, e: 8, air: "2019-11-12" }, { s: 4, e: 22, air: "2022-05-01" }, { s: 6, e: 9, air: "2024-03-01" }];
  const s = spanFromEpisodes("tv:79744", rookie, 4, show, { s: 2, e: 8 })!;
  assert.equal(s.start, "2018-11-13");
  assert.equal(s.end, "2019-11-12", "S4 and S6 are not shown");
  assert.equal(s.n, 2);
  assert.equal(spanFromEpisodes("tv:79744", rookie, 4, show, { s: 1, e: 2 }), null, "not in scope at all: absent");
  assert.equal(spanFromEpisodes("tv:79744", rookie, 4, show, { s: 2, e: null })!.n, 2, "season only keeps all of season 2");
});

test("run label", () => {
  assert.equal(runLabel("The Big Bang Theory", "2007-09-24", "2019-05-16"), "during The Big Bang Theory's run, 2007-19");
  assert.equal(runLabel("Show", "2010-01-01", "2010-12-01"), "during Show's run, 2010");
});

test("a regular's credit gives seasons, not episodes: those air dates are their own dates", () => {
  const seasons = [{ s: 2, air: "2021-01-05" }, { s: 1, air: "2020-11-18" }, { s: 3, air: "2022-02-01" }, { s: 0, air: "2019-01-01" }, { s: 4, air: "" }];
  const s = spanFromEpisodes("tv:9", [], 40, { first: "2020-11-18", last: "2022-05-01" }, null, seasons)!;
  assert.equal(s.kind, "own");
  assert.equal(s.start, "2020-11-18");
  assert.equal(s.end, "2022-02-01");
  assert.equal(yearSpan(s.start, s.end), "2020-22");
  assert.equal(spanFromEpisodes("tv:9", [eps[0]], 40, show, null, seasons)!.kind, "own", "a short episode list does not beat the seasons");
  assert.equal(spanFromEpisodes("tv:9", eps, 3, show, null, seasons)!.start, "2008-11-17", "a complete episode list still wins");
});

test("seasons never widen the show being watched (its dates stay clipped to the position)", () => {
  assert.equal(spanFromEpisodes("tv:9", [], 40, null, { s: 1, e: 2 }, [{ s: 1, air: "2020-11-18" }]), null);
});

test("neither episodes nor seasons: the show's run, written as such", () => {
  const s = spanFromEpisodes("tv:9", [], 40, { first: "2020-11-18", last: "2022-05-01" }, null, [])!;
  assert.equal(s.kind, "run");
  assert.equal(showRunLabel(s.start, s.end), "2020-22 (show's run)");
});
