import test from "node:test";
import assert from "node:assert/strict";
import { buildProfile } from "../../src/lib/foryou-rank";
import { hype, isPickable, rankUpcoming, scoreUpcoming, upWhy, upWhyShort, type UpCand } from "../../src/lib/upcoming-rank";
import { dueLabel } from "../../src/lib/upcoming";

const TODAY = "2026-11-27";
const cand = (p: Partial<UpCand> & { id: number }): UpCand => ({ genres: [], lang: "en", year: 2027, avg: 0, votes: 0, pop: 5, date: "2027-03-01", ...p });
// Taste: drama (18) and thriller (53), loves director 7.
const like = buildProfile([
  { w: 3.2, cand: { id: 1, genres: [18, 53], lang: "en", year: 2020, avg: 8, votes: 1000, pop: 10, people: [{ id: 7, name: "Dir", k: 1 }] } },
  { w: 3.2, cand: { id: 2, genres: [18], lang: "en", year: 2021, avg: 8, votes: 1000, pop: 10, people: [{ id: 7, name: "Dir", k: 1 }] } },
]);
const dislike = buildProfile([{ w: -1.6, cand: { id: 3, genres: [16], lang: "ja", year: 2020, avg: 6, votes: 100, pop: 10 } }], -1);

test("only dated, future, in-horizon titles outside the library are pickable", () => {
  const own = new Set(["movie:5"]);
  assert.equal(isPickable({ date: "2027-01-01" }, "movie:4", own, TODAY), true);
  assert.equal(isPickable({ date: "2027-01-01" }, "movie:5", own, TODAY), false, "in library");
  assert.equal(isPickable({ date: TODAY }, "movie:4", own, TODAY), false, "out today");
  assert.equal(isPickable({ date: "2026-10-01" }, "movie:4", own, TODAY), false, "already out");
  assert.equal(isPickable({ date: "2028-06-01" }, "movie:4", own, TODAY), false, "too far");
  assert.equal(isPickable({ date: "" }, "movie:4", own, TODAY), false, "undated");
});

test("taste beats hype; a liked person and a liked saga lift a title", () => {
  const fits = cand({ id: 10, genres: [18, 53] });
  const hyped = cand({ id: 11, genres: [16], pop: 300 });
  const director = cand({ id: 12, genres: [35], people: [{ id: 7, name: "Dir", k: 1 }] });
  const saga = cand({ id: 13, genres: [28], saga: { t: "Old One", how: "loved" } });
  assert.ok(scoreUpcoming(fits, like, dislike) > scoreUpcoming(hyped, like, dislike));
  assert.ok(scoreUpcoming(director, like, dislike) > scoreUpcoming(cand({ id: 14, genres: [35] }), like, dislike));
  assert.ok(scoreUpcoming(saga, like, dislike) > scoreUpcoming(cand({ id: 15, genres: [28] }), like, dislike));
  assert.deepEqual(rankUpcoming([hyped, fits], like, dislike).map((x) => x.c.id), [10, 11]);
});

test("ties go to the sooner release", () => {
  const a = cand({ id: 20, genres: [18], date: "2027-05-01" }), b = cand({ id: 21, genres: [18], date: "2027-02-01" });
  assert.deepEqual(rankUpcoming([a, b], like, dislike).map((x) => x.c.id), [21, 20]);
});

test("hype is a 0..1 log scale", () => {
  assert.equal(hype(0), 0);
  assert.ok(hype(30) > hype(3));
  assert.equal(hype(1e6), 1);
});

test("reasons name the saga, then people, then genres", () => {
  assert.equal(upWhy({ saga: { t: "Dune", how: "loved" }, people: [], genres: ["Drama"] }), "Next in the saga of Dune, which you rated highly.");
  assert.equal(upWhy({ people: [{ name: "Zendaya", titles: ["Challengers"] }], genres: [] }), "With Zendaya (Challengers).");
  assert.equal(upWhy({ people: [], genres: ["Drama", "Thriller", "Crime"] }), "Fits your taste for Drama and Thriller.");
  assert.equal(upWhyShort({ people: [{ name: "Zendaya", titles: [] }], genres: ["Drama"] }), "With Zendaya");
  assert.equal(upWhyShort({ people: [], genres: [] }), "Anticipated");
});

test("dueLabel: day when near, month when far, year when not this year", () => {
  assert.equal(dueLabel("2026-12-14", TODAY), "Out 14 Dec");
  assert.equal(dueLabel("2027-01-10", TODAY), "Out 10 Jan 2027");
  assert.equal(dueLabel("2027-09-10", TODAY), "Out Sep 2027");
  assert.equal(dueLabel("", TODAY), "TBA");
});
