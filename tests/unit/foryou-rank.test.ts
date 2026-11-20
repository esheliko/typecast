import test from "node:test";
import assert from "node:assert/strict";
import { howOf, buildProfile, kwFit, parseExtras, peopleFit, personMatches, quality, rerank, sampleSeeds, scorePool, seedWeight, type Cand, type Pooled } from "../../src/lib/foryou-rank";
import type { LibItem } from "../../src/lib/types";

const NOW = 1_700_000_000_000, DAY = 86400000;
const lib = (o: Partial<LibItem>): LibItem => ({ key: "movie:1", type: "movie", id: 1, title: "x", year: "2000", poster: null, status: "watched", priority: "someday", rating: 0, note: "", progress: null, added: NOW, watchedAt: NOW, updated: NOW, ...o });
const cand = (id: number, o: Partial<Cand> = {}): Cand => ({ id, genres: [18], lang: "en", year: 2015, avg: 7.5, votes: 5000, pop: 20, ...o });

test("seedWeight: loved > liked > unrated; low ratings are negative; must-watch beats plain watchlist", () => {
  const w = (o: Partial<LibItem>) => seedWeight(lib(o), NOW);
  assert.ok(w({ rating: 5 }) > w({ rating: 4 }) && w({ rating: 4 }) > w({ rating: 3 }));
  assert.ok(w({ rating: 0 }) > w({ rating: 3 }));
  assert.ok(w({ rating: 1 }) < w({ rating: 2 }) && w({ rating: 2 }) < 0);
  assert.ok(w({ status: "watchlist", priority: "must" }) > w({ status: "watchlist" }));
});

test("seedWeight fades with age but never below half", () => {
  const fresh = seedWeight(lib({ rating: 4 }), NOW), old = seedWeight(lib({ rating: 4, watchedAt: NOW - 20 * 365 * DAY }), NOW);
  assert.ok(old < fresh && old >= fresh * 0.5 - 1e-9);
});

test("sampleSeeds keeps anchors, ignores non-positive, is deterministic", () => {
  const items = [5, 4, 3, 2, 1, 0.5, -1].map((w) => ({ w }));
  const r = () => 0.5;
  const a = sampleSeeds(items, 4, 2, r), b = sampleSeeds(items, 4, 2, r);
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
  assert.deepEqual(a.slice(0, 2).map((x) => x.w), [5, 4]);
  assert.ok(a.every((x) => x.w > 0));
});

test("quality: few votes cannot beat many", () => {
  assert.ok(quality(9.2, 10) < quality(8.1, 20000));
});

test("more agreeing seeds and a better genre fit rank higher; dislikes push down", () => {
  const like = buildProfile([{ w: 3, cand: cand(1, { genres: [18, 80] }) }]);
  const none = buildProfile([]);
  const pool: Pooled[] = [
    { cand: cand(10, { genres: [18, 80] }), votesFrom: [0.4, 0.4], explore: false },
    { cand: cand(11, { genres: [35] }), votesFrom: [0.4], explore: false },
  ];
  const s = scorePool(pool, like, none, 2026);
  assert.ok(s[0].score > s[1].score);
  const dis = buildProfile([{ w: -2, cand: cand(2, { genres: [18, 80] }) }], -1);
  const s2 = scorePool(pool, like, dis, 2026);
  assert.ok(s2[0].score < s[0].score);
});

test("rerank spreads genres and gives every 6th slot to exploration", () => {
  const mk = (id: number, score: number, genres: number[], explore = false) => ({ id, score, genres, explore, parts: { cf: 0, content: 0, q: 0, neg: 0, people: 0 } });
  const scored = [
    ...Array.from({ length: 10 }, (_, i) => mk(i, 1 - i * 0.01, [28])),
    mk(100, 0.93, [35]), mk(101, 0.9, [9648]),
    mk(200, 0.5, [99], true), mk(201, 0.4, [37], true),
  ];
  const out = rerank(scored, { every: 6 });
  assert.equal(out.length, scored.length);
  assert.equal(out[5], 200);
  assert.ok(out.indexOf(100) < 5 && out.indexOf(101) < 6, "other genres surface before the 10 near-identical ones run out");
  assert.equal(new Set(out).size, out.length);
});

import { whyText } from "../../src/lib/foryou-rank";
test("whyText names the seeds, then falls back to genres, then to exploration; only IMDb's score is quoted", () => {
  const a = whyText({ by: [{ t: "Heat", how: "loved" as const }, { t: "Ronin", how: "want" as const }, { t: "Collateral", how: "watched" as const }], genres: ["Crime", "Thriller"], explore: false, imdb: { rating: 8.24, votes: 12300 } });
  assert.match(a, /Because you rated Heat highly and Ronin is on your to-watch list \(and 1 more like it\)/);
  assert.match(a, /Crime and Thriller/);
  assert.match(a, /IMDb 8\.2 \(12\.3k votes\)/);
  assert.doesNotMatch(whyText({ by: [{ t: "Heat", how: "must" }], genres: [], explore: false }), /IMDb|rated/);
  assert.match(whyText({ by: [], genres: ["Drama"], explore: false, imdb: { rating: 7.5, votes: 900 } }), /genres you lean towards \(Drama\): IMDb 7\.5/);
  assert.match(whyText({ by: [], genres: ["Comedy"], explore: true }), /change of pace/);
});

test("quality uses IMDb's score when known: a title IMDb rates higher ranks higher at equal TMDB numbers", () => {
  const like = buildProfile([]), none = buildProfile([]);
  const a = { cand: { ...cand(1), imdb: { rating: 8.4, votes: 200000 } }, votesFrom: [], explore: false };
  const b = { cand: { ...cand(2), imdb: { rating: 6.2, votes: 200000 } }, votesFrom: [], explore: false };
  const [sa, sb] = scorePool([a, b], like, none, 2026);
  assert.ok(sa.score > sb.score);
});

test("wanting to watch is a weaker signal than having watched, and is worded as such", () => {
  const w = (o: Partial<LibItem>) => seedWeight(lib(o), NOW);
  assert.ok(w({ rating: 0 }) > w({ status: "watchlist", priority: "must" }));
  assert.ok(w({ rating: 3 }) > w({ status: "watchlist", priority: "must" }));
  assert.equal(howOf(lib({ status: "watchlist", priority: "must" })), "must");
  assert.equal(howOf(lib({ status: "watchlist" })), "want");
  assert.equal(howOf(lib({ rating: 5 })), "loved");
  assert.equal(howOf(lib({ rating: 0 })), "watched");
  assert.equal(howOf(lib({ status: "watching" })), "watching");
  assert.match(whyText({ by: [{ t: "Dune", how: "must" }], genres: [], explore: false }), /^Because Dune is on your must-watch list\./);
  assert.doesNotMatch(whyText({ by: [{ t: "Dune", how: "want" }], genres: [], explore: false }), /liked|rated|watched Dune/);
});

test("partly watched is its own thing: weaker than watching, and worded as such", () => {
  const w = (o: Partial<LibItem>) => seedWeight(lib(o), NOW);
  assert.ok(w({ status: "partial" }) < w({ status: "watching" }));
  assert.ok(w({ status: "partial" }) > 0);
  assert.equal(howOf(lib({ status: "partial" })), "partial");
  assert.equal(howOf(lib({ status: "partial", rating: 5 })), "loved");
  assert.match(whyText({ by: [{ t: "Dune", how: "partial" }], genres: [], explore: false }), /^Because you watched part of Dune\./);
});

test("parseExtras reads keywords, director/creator and billed cast for films and series", () => {
  const film = parseExtras({
    keywords: { keywords: [{ id: 1 }, { id: 2 }] },
    credits: { cast: [{ id: 20, name: "B", order: 3 }, { id: 10, name: "A", order: 0 }], crew: [{ id: 30, name: "D", job: "Director" }, { id: 31, name: "W", job: "Writer" }] },
  }, "movie");
  assert.deepEqual(film.kw, [1, 2]);
  assert.deepEqual(film.people.map((p) => p.id), [30, 10, 20]);
  assert.equal(film.people[0].k, 1);
  assert.ok(film.people[2].k < film.people[1].k);
  const show = parseExtras({ keywords: { results: [{ id: 7 }] }, created_by: [{ id: 40, name: "C" }], aggregate_credits: { cast: [{ id: 41, name: "E", order: 0 }] } }, "tv");
  assert.deepEqual(show.kw, [7]);
  assert.deepEqual(show.people.map((p) => p.id), [40, 41]);
  assert.deepEqual(parseExtras(null, "movie"), { kw: [], people: [], collection: null });
});

test("people you keep watching boost a candidate; two favourites beat one; unknown people change nothing", () => {
  const star = { id: 10, name: "A", k: 1 }, other = { id: 11, name: "B", k: 1 };
  const like = buildProfile([
    { w: 3.2, cand: cand(1, { people: [star, other] }) },
    { w: 3.2, cand: cand(2, { people: [star] }) },
  ]);
  assert.equal(peopleFit(like, undefined), 0);
  assert.equal(peopleFit(like, [{ id: 99, name: "Z", k: 1 }]), 0);
  const one = peopleFit(like, [other]), both = peopleFit(like, [star, other]);
  assert.ok(one > 0 && both > peopleFit(like, [star]) && both <= 1);
  assert.equal(personMatches(like, [other, star])[0].person.id, 10);
  const pool: Pooled[] = [{ cand: cand(5, { people: [star] }), votesFrom: [0.3], explore: false }, { cand: cand(6, { people: [{ id: 99, name: "Z", k: 1 }] }), votesFrom: [0.3], explore: false }];
  const s = scorePool(pool, like, buildProfile([]), 2026);
  assert.ok(s[0].score > s[1].score);
});

test("keyword overlap raises content fit; a candidate without known keywords is not penalised for it", () => {
  const like = buildProfile([{ w: 3, cand: cand(1, { kw: [1, 2, 3, 4] }) }]);
  assert.ok(kwFit(like, [1, 2]) > kwFit(like, [8, 9]));
  assert.equal(kwFit(like, []), 0);
  const known = scorePool([{ cand: cand(5, { kw: [1, 2, 3] }), votesFrom: [0.3], explore: false }, { cand: cand(6, { kw: [8, 9] }), votesFrom: [0.3], explore: false }], like, buildProfile([]), 2026);
  assert.ok(known[0].score > known[1].score);
  const unknown = scorePool([{ cand: cand(7), votesFrom: [0.3], explore: false }], like, buildProfile([]), 2026)[0];
  assert.ok(unknown.score > known[1].score - 0.05);
});

test("a title on your services gets a small nudge", () => {
  const like = buildProfile([{ w: 3, cand: cand(1) }]);
  const [a, b] = scorePool([{ cand: cand(5, { onService: true }), votesFrom: [], explore: false }, { cand: cand(6), votesFrom: [], explore: false }], like, buildProfile([]), 2026);
  assert.ok(a.score > b.score);
});

test("whyText names the shared person and service", () => {
  const t = whyText({ by: [], genres: ["Drama"], explore: false, people: [{ name: "Bryan Cranston", titles: ["Breaking Bad"] }], onService: true });
  assert.match(t, /Features Bryan Cranston, who you liked in Breaking Bad/);
  assert.match(t, /On one of your services/);
  assert.match(whyText({ by: [{ t: "Heat", how: "loved" }], genres: [], explore: false, people: [{ name: "Al Pacino", titles: ["Heat"] }] }), /Because you rated Heat highly\. Features Al Pacino/);
});
