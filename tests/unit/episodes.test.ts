import test from "node:test";
import assert from "node:assert/strict";
import { appearanceLine, creditSub, epsLabel, fmtDate, nextAfter, seasonsLabel, showLine, untilLabel, upTo, yearSpan } from "../../src/lib/episodes";

const ep = (s: number, e: number, air = "") => ({ s, e, name: "", air, runtime: null, rating: 0, votes: 0 });

test("dates read as calendar days", () => {
  assert.equal(fmtDate("2011-10-09"), "9 Oct 2011");
  assert.equal(fmtDate("2011-10-09", true), "Sun 9 Oct 2011");
  assert.equal(fmtDate(""), "");
});
test("until labels", () => {
  assert.equal(untilLabel("2026-11-08", "2026-11-08"), "today");
  assert.equal(untilLabel("2026-11-09", "2026-11-08"), "tomorrow");
  assert.equal(untilLabel("2026-11-13", "2026-11-08"), "in 5 days");
  assert.equal(untilLabel("2026-11-01", "2026-11-08"), "");
});
test("year spans and show line", () => {
  assert.equal(yearSpan("2008-01-20", "2013-09-29", false), "2008–2013");
  assert.equal(yearSpan("2021-01-01", "2021-05-01", false), "2021");
  assert.equal(yearSpan("2019-01-01", "2024-05-01", true), "2019–");
  assert.equal(showLine({ first: "2008-01-20", last: "2013-09-29", seasons: 5, episodes: 62, status: "Ended", next: null, latest: null }), "5 seasons · 62 episodes · 2008–2013 · Ended");
});
test("seasons label", () => {
  assert.equal(seasonsLabel([2]), "Season 2");
  assert.equal(seasonsLabel([1, 2, 3]), "Seasons 1–3");
  assert.equal(seasonsLabel([1, 3]), "Seasons 1, 3");
});
test("episode counts", () => {
  assert.equal(epsLabel(62, 62), "every episode");
  assert.equal(epsLabel(3, 62), "3 eps");
  assert.equal(epsLabel(1), "1 ep");
  assert.equal(epsLabel(undefined), "");
  assert.equal(creditSub("Detective Munn", 3, "2011-10-09", "2008-01-20"), "Detective Munn · 3 episodes, from 2011");
  assert.equal(creditSub("Walter White", 62, "2008-01-20", "2008-01-20"), "Walter White · 62 episodes");
  assert.equal(creditSub("Lead", undefined, undefined), "Lead");
});
test("appearance summary", () => {
  assert.equal(appearanceLine({ roles: [], total: 3, episodes: [ep(4, 13, "2011-10-09"), ep(5, 1, "2012-07-15"), ep(5, 12, "2013-09-08")], seasons: [4, 5], showEpisodes: 62 }), "3 episodes · 2011–2013 · Seasons 4–5");
  assert.equal(appearanceLine({ roles: [], total: 62, episodes: [], seasons: [1, 2, 3, 4, 5], showEpisodes: 62 }), "Every episode (62) · Seasons 1–5");
});
test("progress helpers", () => {
  const list = [ep(1, 1), ep(1, 2), ep(2, 1)];
  assert.deepEqual(nextAfter(list, { s: 1, e: 2 }), ep(2, 1));
  assert.deepEqual(nextAfter(list, null), ep(1, 1));
  assert.equal(nextAfter(list, { s: 2, e: 1 }), null);
  assert.equal(upTo(ep(1, 2), { s: 2, e: 1 }), true);
  assert.equal(upTo(ep(2, 2), { s: 2, e: 1 }), false);
  assert.equal(upTo(ep(1, 1), null), false);
});
test("previous episode steps back across seasons", async () => {
  const { prevEpisode } = await import("../../src/lib/episodes");
  const seasons = [{ n: 1, eps: 7 }, { n: 2, eps: 13 }];
  assert.deepEqual(prevEpisode({ s: 2, e: 5 }, seasons), { s: 2, e: 4 });
  assert.deepEqual(prevEpisode({ s: 2, e: 1 }, seasons), { s: 1, e: 7 });
  assert.equal(prevEpisode({ s: 1, e: 1 }, seasons), null);
});
test("airing labels", async () => {
  const { airsLabel } = await import("../../src/lib/episodes");
  const today = "2026-11-08"; // a Sunday
  assert.equal(airsLabel("2026-11-08", today), "today");
  assert.equal(airsLabel("2026-11-09", today), "tomorrow");
  assert.equal(airsLabel("2026-11-12", today), "Thursday");
  assert.equal(airsLabel("2026-11-20", today), "on 20 Nov");
  assert.equal(airsLabel("2027-01-07", today), "on 7 Jan 2027");
  assert.equal(airsLabel("2026-11-01", today), "");
});
test("seen in: which of their episodes you have reached", async () => {
  const { seenIn } = await import("../../src/lib/episodes");
  const eps = [{ ...ep(4, 13, "2011-10-09"), name: "Face Off" }, ep(5, 10), ep(5, 11)];
  assert.deepEqual(seenIn(eps, { status: "watching", progress: { s: 4, e: 13 } }), { ep: "S4 E13 “Face Off”" });
  assert.deepEqual(seenIn(eps, { status: "watching", progress: { s: 5, e: 12 } }), { ep: "3 episodes" });
  assert.equal(seenIn(eps, { status: "watching", progress: { s: 2, e: 4 } }), null);
  assert.deepEqual(seenIn(eps, { status: "watched", progress: null }), { ep: "3 episodes" });
  assert.deepEqual(seenIn(eps, { status: "partial", progress: null }), {});
  assert.deepEqual(seenIn([], { status: "watching", progress: { s: 1, e: 1 } }), {});
});
