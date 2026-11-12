import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowsEpisode, allowsSeason, clipEpisodes, clipPosOf, clipSeasonList, hiddenNote, hiddenOf, holdBackAppearances, holdBackBrief, holdBackSeason,
  isHidden, labelOf, lineCacheKey, lineContextFrom, lineParams, NONE, revealedKeys, spoilerLine, type SpoilerLine,
} from "../../src/lib/spoiler-line";
import { spanUnderLine } from "../../src/lib/who-spans";
import { fresh } from "../../src/lib/who-client";
import type { Appearances, Episode } from "../../src/lib/types";

const watching = (s?: number, e?: number) => ({ status: "watching" as const, progress: s ? { s, e: e ?? 1 } : null });
const UP: SpoilerLine = { kind: "upto", s: 2, e: 8 };
const SERIES: SpoilerLine = { kind: "series-only" };

test("spoilerLine: only a series that is Watching has a line", () => {
  assert.deepEqual(spoilerLine("tv:1", watching(2, 8)), UP);
  assert.deepEqual(spoilerLine("tv:1", watching()), SERIES);
  for (const status of ["watchlist", "watched", "partial"] as const) assert.deepEqual(spoilerLine("tv:1", { status, progress: { s: 2, e: 8 } }), NONE, status);
  assert.deepEqual(spoilerLine("tv:1", null), NONE);
  assert.deepEqual(spoilerLine("tv:1", undefined), NONE);
});

test("spoilerLine: a film has none, even when Watching", () => assert.deepEqual(spoilerLine("movie:1", watching(2, 8)), NONE));

test("spoilerLine: a saved place that is not a real episode is no place", () => {
  assert.deepEqual(spoilerLine("tv:1", { status: "watching", progress: { s: 0, e: 3 } }), SERIES);
  assert.deepEqual(spoilerLine("tv:1", { status: "watching", progress: { s: 2, e: 0 } }), SERIES);
});

test("spoilerLine: Show lifts it for that view", () => assert.deepEqual(spoilerLine("tv:1", watching(2, 8), { revealed: true }), NONE));

test("spoilerLine: the page's own title is governed by the page; every OTHER Watching title stays protected, with the switch on or off", () => {
  for (const spoilersShown of [true, false]) {
    assert.deepEqual(spoilerLine("tv:1", watching(2, 8), { page: { key: "tv:1", spoilersShown } }), NONE);
    assert.deepEqual(spoilerLine("tv:2", watching(2, 8), { page: { key: "tv:1", spoilersShown } }), UP);
    assert.deepEqual(spoilerLine("tv:2", watching(), { page: { key: "tv:1", spoilersShown } }), SERIES);
  }
});

test("allowsEpisode: up to and including the saved place, the next episode stays hidden", () => {
  assert.equal(allowsEpisode(UP, 2, 8), true);
  assert.equal(allowsEpisode(UP, 2, 9), false);
  assert.equal(allowsEpisode(UP, 2, 1), true);
  assert.equal(allowsEpisode(UP, 1, 22), true);
  assert.equal(allowsEpisode(UP, 3, 1), false);
  assert.equal(allowsEpisode(UP, 0, 1), false, "specials are not told under a line");
  assert.equal(allowsEpisode(SERIES, 1, 1), false);
  assert.equal(allowsEpisode(NONE, 9, 9), true);
  assert.equal(allowsEpisode(NONE, 0, 1), true);
});

test("allowsSeason: up to and including the season of the place", () => {
  assert.equal(allowsSeason(UP, 2), true); assert.equal(allowsSeason(UP, 3), false); assert.equal(allowsSeason(UP, 0), false);
  assert.equal(allowsSeason(SERIES, 1), false); assert.equal(allowsSeason(NONE, 5), true);
});

test("clips keep the same list when nothing is held back", () => {
  const eps = [{ s: 1, e: 1 }, { s: 3, e: 2 }];
  assert.equal(clipEpisodes(eps, NONE), eps);
  assert.deepEqual(clipEpisodes(eps, UP), [{ s: 1, e: 1 }]);
  assert.deepEqual(clipEpisodes(eps, SERIES), []);
  assert.deepEqual(clipSeasonList([0, 1, 2, 3], UP), [1, 2]);
  assert.deepEqual(clipSeasonList([1, 2], SERIES), []);
});

test("clipPosOf: allow-nothing is its own value, never a null position (null means everything)", () => {
  assert.equal(clipPosOf(NONE), null);
  assert.deepEqual(clipPosOf(UP), { s: 2, e: 8 });
  assert.equal(clipPosOf(SERIES), "nothing");
});

test("labels and markers", () => {
  assert.equal(labelOf(UP, "The Rookie"), "Spoilers hidden for The Rookie");
  assert.equal(labelOf(NONE, "The Rookie"), "");
  assert.equal(isHidden(NONE), false); assert.equal(isHidden(UP), true); assert.equal(isHidden(SERIES), true);
  assert.equal(hiddenOf(NONE), undefined);
  assert.deepEqual(hiddenOf(UP), { kind: "upto", s: 2, e: 8 });
  assert.deepEqual(hiddenOf(SERIES), { kind: "series-only" });
  assert.equal(hiddenNote({ kind: "upto", s: 2, e: 8 }), "up to S2 E8");
  assert.equal(hiddenNote({ kind: "series-only" }), "");
  assert.equal(hiddenNote(undefined), "");
});

test("request parameters: the page, its switch and Show", () => {
  const get = (o: Record<string, string>) => (n: string) => o[n] ?? null;
  assert.deepEqual(lineContextFrom(get({})), { revealed: false });
  assert.deepEqual(lineContextFrom(get({ pg: "tv-79744", ps: "1" })), { page: { key: "tv:79744", spoilersShown: true }, revealed: false });
  assert.deepEqual(lineContextFrom(get({ pg: "tv:79744" })), { page: { key: "tv:79744", spoilersShown: false }, revealed: false });
  assert.deepEqual(lineContextFrom(get({ pg: "nonsense", ps: "1" })), { revealed: false });
  assert.equal(lineContextFrom(get({ reveal: "1" })).revealed, true);
  assert.equal(lineContextFrom(get({ reveal: "0" })).revealed, false);
  assert.equal(lineContextFrom(get({ full: "1" }), true).revealed, true, "the older full=1 of Glimpse is a Show too");
});

test("lineParams round-trips through lineContextFrom", () => {
  const p: Record<string, string> = lineParams({ page: { key: "tv:79744", spoilersShown: true }, reveal: true });
  assert.deepEqual(p, { pg: "tv-79744", ps: "1", reveal: "1" });
  assert.deepEqual(lineContextFrom((n) => (p as Record<string, string>)[n] ?? null), { page: { key: "tv:79744", spoilersShown: true }, revealed: true });
  assert.deepEqual(lineParams({}), {});
  assert.deepEqual(lineParams({ page: { key: "tv:1", spoilersShown: false } }), { pg: "tv-1" });
});

test("lineCacheKey: a different page, switch or Show is a different answer", () => {
  const keys = [
    lineCacheKey({}), lineCacheKey({ reveal: true }),
    lineCacheKey({ page: { key: "tv:1", spoilersShown: false } }), lineCacheKey({ page: { key: "tv:1", spoilersShown: true } }), lineCacheKey({ page: { key: "tv:2", spoilersShown: false } }),
    lineCacheKey({ page: { key: "tv:1", spoilersShown: false }, reveal: true }),
  ];
  assert.equal(new Set(keys).size, keys.length);
});

test("revealedKeys: 1 is every key asked for, else the list (only keys that were asked)", () => {
  const asked = ["tv:1", "tv:2", "tv:3"];
  assert.deepEqual([...revealedKeys("1", asked)], asked);
  assert.deepEqual([...revealedKeys("tv:2,tv-3,tv:9", asked)].sort(), ["tv:2", "tv:3"]);
  assert.equal(revealedKeys(null, asked).size, 0);
  assert.equal(revealedKeys("", asked).size, 0);
});

test("client cache: a library-aware answer is only good for a short time; the rest for the session", () => {
  assert.equal(fresh(1000, 1000 + 29_000, 30_000), true);
  assert.equal(fresh(1000, 1000 + 31_000, 30_000), false);
  assert.equal(fresh(1000, 1000 + 99_999_999), true);
});

const ep = (s: number, e: number): Episode => ({ s, e, name: `Name ${s}x${e}`, air: `2020-0${s}-0${e}`, runtime: 42, rating: 8.1, votes: 99, finale: e === 9, overview: "Someone dies.", still: "/x.jpg", directors: ["D"], writers: ["W"], guests: [{ id: 1, name: "G", photo: null, role: "R" }] });
const season = { name: "Season 2", air: "2020-02-01", episodes: [ep(2, 7), ep(2, 8), ep(2, 9)] };

test("holdBackSeason: later episodes keep their number, air date and runtime only", () => {
  const out = holdBackSeason(season, UP);
  assert.equal(out.episodes[0].name, "Name 2x7");
  assert.equal(out.episodes[1].overview, "Someone dies.", "the saved place itself is told");
  const h = out.episodes[2];
  assert.deepEqual([h.s, h.e, h.air, h.runtime, h.hidden], [2, 9, "2020-02-09", 42, true]);
  assert.deepEqual([h.name, h.overview, h.still, h.directors, h.writers, h.guests, h.rating, h.votes, h.finale], ["", "", null, [], [], [], 0, 0, undefined]);
  assert.deepEqual(out.hidden, { kind: "upto", s: 2, e: 8 });
  assert.equal(out.episodes.filter((x) => x.hidden).length, 1);
});

test("holdBackSeason: series-only hides every episode; none returns the very same object", () => {
  assert.equal(holdBackSeason(season, SERIES).episodes.every((x) => x.hidden && x.name === ""), true);
  assert.equal(holdBackSeason(season, NONE), season);
});

const apps: Appearances = { roles: [{ role: "Nell", eps: 5 }], total: 5, showEpisodes: 62, seasons: [1, 2, 3], episodes: [{ s: 1, e: 1, name: "A", air: "", runtime: null, rating: 0, votes: 0 }, { s: 3, e: 2, name: "B", air: "", runtime: null, rating: 0, votes: 0 }] };

test("holdBackAppearances: later episodes are dropped (not listed), counts that give the series away go", () => {
  const out = holdBackAppearances(apps, UP);
  assert.deepEqual(out.episodes.map((x) => x.name), ["A"]);
  assert.deepEqual(out.seasons, [1, 2]);
  assert.equal(out.total, 1); assert.equal(out.showEpisodes, 0); assert.deepEqual(out.roles, [{ role: "Nell", eps: 0 }]);
  assert.deepEqual(out.hidden, { kind: "upto", s: 2, e: 8 });
  const none = holdBackAppearances(apps, SERIES);
  assert.deepEqual([none.episodes, none.seasons, none.total], [[], [], 0]);
  assert.equal(holdBackAppearances(apps, NONE), apps);
});

test("holdBackBrief: no end date, status or later seasons", () => {
  const b = { key: "tv:1", first: "2018-01-01", last: "2024-05-01", status: "Ended", seasons: [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }] };
  const out = holdBackBrief(b, UP);
  assert.deepEqual([out.first, out.last, out.status, out.seasons.map((x) => x.n)], ["2018-01-01", "", "", [1, 2]]);
  assert.deepEqual(holdBackBrief(b, SERIES).seasons, []);
  assert.equal(holdBackBrief(b, NONE), b);
});

test("spanUnderLine: dates stop at the saved place; no place gives an empty stub; never the show's run", () => {
  const eps = [{ s: 1, e: 1, air: "2018-01-01" }, { s: 2, e: 8, air: "2019-03-01" }, { s: 2, e: 9, air: "2019-03-08" }, { s: 4, e: 1, air: "2021-01-01" }];
  const sp = spanUnderLine("tv:1", UP, 4, { eps, seasons: [] })!;
  assert.deepEqual([sp.start, sp.end, sp.n, sp.kind, sp.hidden], ["2018-01-01", "2019-03-01", 2, "own", { kind: "upto", s: 2, e: 8 }]);
  assert.equal(sp.show, undefined);
  const stub = spanUnderLine("tv:1", SERIES, 4, { eps, seasons: [] })!;
  assert.deepEqual([stub.start, stub.end, stub.n, stub.eps, stub.hidden], ["", "", 0, [], { kind: "series-only" }]);
  assert.equal(spanUnderLine("tv:1", NONE, 4, { eps, seasons: [] }), null);
});

test("spanUnderLine: a regular with only seasons listed gets the seasons up to the place; nothing in scope is a stub", () => {
  const seasons = [{ s: 1, air: "2018-01-01" }, { s: 2, air: "2019-01-01" }, { s: 3, air: "2020-01-01" }];
  const sp = spanUnderLine("tv:1", UP, 60, { eps: [], seasons })!;
  assert.deepEqual([sp.start, sp.end, sp.n], ["2018-01-01", "2019-01-01", 0]);
  const none = spanUnderLine("tv:1", { kind: "upto", s: 1, e: 1 }, 5, { eps: [{ s: 2, e: 1, air: "2019-01-01" }], seasons: [{ s: 3, air: "2020-01-01" }] })!;
  assert.deepEqual([none.start, none.hidden?.kind], ["", "upto"]);
});
