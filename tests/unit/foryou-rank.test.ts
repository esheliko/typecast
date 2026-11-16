import test from "node:test";
import assert from "node:assert/strict";
import { buildProfile, quality, rerank, sampleSeeds, scorePool, seedWeight, type Cand, type Pooled } from "../../src/lib/foryou-rank";
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
  const mk = (id: number, score: number, genres: number[], explore = false) => ({ id, score, genres, explore, parts: { cf: 0, content: 0, q: 0, neg: 0 } });
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
  const a = whyText({ by: ["Heat", "Ronin", "Collateral"], genres: ["Crime", "Thriller"], explore: false, imdb: { rating: 8.24, votes: 12300 } });
  assert.match(a, /Because you liked Heat and Ronin and 1 more/);
  assert.match(a, /Crime and Thriller/);
  assert.match(a, /IMDb 8\.2 \(12\.3k votes\)/);
  assert.doesNotMatch(whyText({ by: ["Heat"], genres: [], explore: false }), /IMDb|rated/);
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
