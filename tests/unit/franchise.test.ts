import test from "node:test";
import assert from "node:assert/strict";
import { capPerFranchise, decayByFranchise, distinctGroups, franchiseFactor } from "../../src/lib/franchise";
import { buildProfile, kwFit, parseExtras, scorePool, type Cand, type Pooled } from "../../src/lib/foryou-rank";
import { genreTaste, recommenders, tasteSeeds, type Facts } from "../../src/lib/upnext";
import type { LibItem } from "../../src/lib/types";

const NOW = 1_700_000_000_000;
const lib = (id: number, o: Partial<LibItem> = {}): LibItem => ({ key: `movie:${id}`, type: "movie", id, title: `T${id}`, year: "2010", poster: null, status: "watched", priority: "someday", rating: 5, note: "", progress: null, added: NOW, watchedAt: NOW - id, updated: NOW, ...o });
const facts = (o: Partial<Facts> = {}): Facts => ({ genres: [28], vote: 7, votes: 1000, runtime: 100, released: "2010-01-01", lastAired: null, onMine: [], streamable: true, recs: [], ...o });
const cand = (id: number, o: Partial<Cand> = {}): Cand => ({ id, genres: [28], lang: "en", year: 2010, avg: 7.5, votes: 5000, pop: 20, ...o });

test("decayByFranchise: only the strongest of a saga keeps full weight; loose titles are untouched", () => {
  const items = [{ w: 3, g: 7 }, { w: 3, g: 7 }, { w: 3, g: 7 }, { w: 3, g: null }, { w: 2.4, g: 8 }];
  const d = decayByFranchise(items, (x) => x.w, (x) => x.g);
  assert.equal(d[0], 3);
  assert.ok(d[1] < d[0] && d[2] < d[1]);
  assert.equal(d[3], 3);
  assert.equal(d[4], 2.4);
  // five films of a saga are worth far less than five separate films, but more than one
  const saga = decayByFranchise(Array.from({ length: 5 }, () => ({ w: 3, g: 1 })), (x) => x.w, (x) => x.g).reduce((a, b) => a + b, 0);
  assert.ok(saga > 3 && saga < 3 * 5 * 0.65, String(saga));
});

test("decayByFranchise: the strongest title leads whatever the order, and dislikes fade too", () => {
  const d = decayByFranchise([{ w: 1, g: 1 }, { w: 3, g: 1 }], (x) => x.w, (x) => x.g);
  assert.equal(d[1], 3);
  assert.equal(d[0], 1 * franchiseFactor(1));
  const neg = decayByFranchise([{ w: -1.6, g: 1 }, { w: -1.6, g: 1 }], (x) => x.w, (x) => x.g);
  assert.ok(neg[1] > -1.6 && neg[1] < 0);
});

test("distinctGroups and capPerFranchise", () => {
  const xs = [{ id: "a", g: 1 }, { id: "b", g: 1 }, { id: "c", g: 1 }, { id: "d", g: null }, { id: "e", g: null }];
  assert.equal(distinctGroups(xs, (x) => x.g, (x) => x.id), 3);
  assert.deepEqual(capPerFranchise(xs, (x) => x.g, 2).map((x) => x.id), ["a", "b", "d", "e"]);
});

test("parseExtras reads a film's collection, never a series'", () => {
  assert.equal(parseExtras({ belongs_to_collection: { id: 10 } }, "movie").collection, 10);
  assert.equal(parseExtras({ belongs_to_collection: null }, "movie").collection, null);
  assert.equal(parseExtras({ belongs_to_collection: { id: 10 } }, "tv").collection, null);
});

test("For you: a sequel of a saga is judged on what the saga does not already explain", () => {
  // Five films of one saga, all loved; they share genre 28, theme 1 and cast 99.
  const saga = Array.from({ length: 5 }, (_, i) => ({ w: 3, cand: cand(i, { genres: [28], kw: [1], people: [{ id: 99, name: "Lead", k: 1 }], collection: 5 }) }));
  const other = { w: 3, cand: cand(50, { genres: [18], kw: [2], people: [{ id: 7, name: "Other", k: 1 }] }) };
  const seeds = [...saga, other];
  const like = buildProfile(seeds);
  const without = (col: number) => buildProfile(seeds.filter((s) => s.cand?.collection !== col));
  const sequel: Pooled = { cand: cand(100, { genres: [28], kw: [1], people: [{ id: 99, name: "Lead", k: 1 }], collection: 5 }), votesFrom: [0.4], explore: false };
  const stranger: Pooled = { cand: cand(101, { genres: [28], kw: [1], people: [{ id: 99, name: "Lead", k: 1 }] }), votesFrom: [0.4], explore: false };
  const none = buildProfile([]);
  const plain = scorePool([sequel], like, none, 2026)[0];
  const aware = scorePool([sequel], like, none, 2026, without)[0];
  assert.ok(aware.score < plain.score, "genre + theme + cast of the saga itself no longer stack on top of TMDB's own vote");
  assert.ok(aware.score > 0.38 * 0.4, "still ranks: TMDB's recommendation and quality count");
  // a title outside the saga with the same facts is judged on them in full (nothing to discount)
  assert.equal(scorePool([stranger], like, none, 2026, without)[0].score, scorePool([stranger], like, none, 2026)[0].score);
});

test("For you: kwFit sanity for the without profile", () => {
  const p = buildProfile([{ w: 3, cand: cand(1, { kw: [1] }) }]);
  assert.ok(kwFit(p, [1]) > 0);
});

test("Watch next: a saga takes at most two taste slots and counts once as a recommender", () => {
  const sagaIds = [1, 2, 3, 4];
  const rec = { key: "movie:900", type: "movie" as const, id: 900, title: "R", year: "2020", poster: "p", vote: 7.5, votes: 900, genres: [28], released: "2020-01-01" };
  const f = new Map<string, Facts>();
  const items = [...sagaIds.map((i) => lib(i)), lib(10), lib(11)];
  for (const i of sagaIds) f.set(`movie:${i}`, facts({ collection: 5, recs: [rec] }));
  f.set("movie:10", facts({ genres: [18] })); f.set("movie:11", facts({ genres: [35] }));
  const seeds = tasteSeeds(items, 12, f);
  assert.equal(seeds.filter((s) => f.get(s.key)?.collection === 5).length, 2);
  assert.equal(tasteSeeds(items, 12).length, 6, "without facts nothing changes");
  assert.equal(recommenders(tasteSeeds(items, 12, f), f).get("movie:900")?.length, 1);
  // genre taste: four saga films (action) do not drown two single films (drama, comedy)
  const t = genreTaste(items, f);
  assert.ok((t.get(18) ?? 0) > 0.3, String(t.get(18)));
});
