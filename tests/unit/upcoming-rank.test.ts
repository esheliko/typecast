import test from "node:test";
import assert from "node:assert/strict";
import { buildProfile } from "../../src/lib/foryou-rank";
import { creditsOf, followedPeople, hype, isConnected, isPickable, rankUpcoming, upWhy, upWhyShort, type Followed, type Role, type UpCand } from "../../src/lib/upcoming-rank";
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

const nolan: Followed = { id: 7, name: "Christopher Nolan", role: "director", score: 6.4, titles: ["Inception", "Oppenheimer"] };
const zendaya: Followed = { id: 8, name: "Zendaya", role: "actor", score: 4, titles: ["Dune", "Challengers", "Euphoria"] };

test("a franchise or a followed person always beats a title that only fits your genres", () => {
  const fits = cand({ id: 10, genres: [18, 53], pop: 300 });
  const saga = cand({ id: 13, genres: [16], saga: { name: "Dune", t: "Dune: Part Two", how: "watched" } });
  const director = cand({ id: 12, genres: [16], via: [nolan] });
  const actor = cand({ id: 14, genres: [16], via: [zendaya] });
  const ids = rankUpcoming([fits, actor, director, saga], like, dislike).map((x) => x.c.id);
  assert.deepEqual(ids, [13, 12, 14, 10]);
  assert.equal(isConnected(fits), false);
  assert.equal(isConnected(actor), true);
});

test("taste still orders the unconnected ones", () => {
  const fits = cand({ id: 10, genres: [18, 53] }), hyped = cand({ id: 11, genres: [16], pop: 300 });
  assert.deepEqual(rankUpcoming([hyped, fits], like, dislike).map((x) => x.c.id), [10, 11]);
});

test("followed people: in two of your titles, or behind one you loved; directing wins over acting", () => {
  const P = (id: number, role: Role, k = 1) => ({ id, name: `P${id}`, role, k });
  const f = followedPeople([
    { title: "A", w: 1.5, people: [P(1, "director"), P(2, "actor"), P(3, "actor")] },
    { title: "B", w: 1.5, people: [P(2, "actor"), P(1, "actor")] },
    { title: "C", w: 3.2, people: [P(4, "actor")] },
    { title: "D", w: 1.2, people: [P(5, "actor", 0.6)] },
  ]);
  assert.deepEqual(f.map((x) => x.id).sort(), [1, 2, 4]);
  assert.equal(f.find((x) => x.id === 1)!.role, "director");
  assert.deepEqual(f.find((x) => x.id === 2)!.titles, ["A", "B"]);
});

test("creditsOf: director, creators and top cast", () => {
  const film = creditsOf({ credits: { crew: [{ id: 1, name: "D", job: "Director" }, { id: 9, job: "Writer" }], cast: [{ id: 2, name: "A", order: 0 }, { id: 3, name: "B", order: 3 }] } }, "movie");
  assert.deepEqual(film.map((x) => [x.id, x.role, x.k]), [[1, "director", 1], [2, "actor", 1], [3, "actor", 1]]);
  const show = creditsOf({ created_by: [{ id: 5, name: "C" }], aggregate_credits: { cast: [] } }, "tv");
  assert.deepEqual(show.map((x) => x.role), ["creator"]);
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

test("reasons name the franchise, then who made it, then who is in it", () => {
  const saga = { name: "Dune", t: "Dune: Part Two", how: "watched" as const };
  assert.equal(upWhy({ saga }, ["Drama"]), "New in the Dune franchise, after Dune: Part Two, which you watched.");
  assert.equal(upWhy({ via: [zendaya, nolan] }, []), "From Christopher Nolan (director of Inception and Oppenheimer). With Zendaya (Dune and Challengers; 3 of your titles).");
  assert.equal(upWhy({}, ["Drama", "Thriller", "Crime"]), "Fits your taste for Drama and Thriller.");
  assert.equal(upWhyShort({ saga }, []), "Next in Dune");
  assert.equal(upWhyShort({ via: [zendaya, nolan] }, []), "From Christopher Nolan");
  assert.equal(upWhyShort({ via: [zendaya] }, []), "With Zendaya");
  assert.equal(upWhyShort({}, []), "Anticipated");
});

test("dueLabel: day when near, month when far, year when not this year", () => {
  assert.equal(dueLabel("2026-12-14", TODAY), "Out 14 Dec");
  assert.equal(dueLabel("2027-01-10", TODAY), "Out 10 Jan 2027");
  assert.equal(dueLabel("2027-09-10", TODAY), "Out Sep 2027");
  assert.equal(dueLabel("", TODAY), "TBA");
});
