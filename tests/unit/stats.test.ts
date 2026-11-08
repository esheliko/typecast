import test from "node:test";
import assert from "node:assert/strict";
import { formatHours, libraryStats, longestStreak, parseYear, recentWatched, tmdbStats, watchedIn, watchedYears, weekIndex } from "../../src/lib/stats";
import type { LibItem } from "../../src/lib/types";

const at = (s: string) => Date.parse(s);
let n = 0;
const item = (o: Partial<LibItem>): LibItem => ({
  key: `movie:${++n}`, type: "movie", id: n, title: `T${n}`, year: "2000", poster: null,
  status: "watched", priority: "someday", rating: 0, note: "", progress: null, added: 0, updated: 0, watchedAt: null, ...o,
});
const NOW = at("2026-11-08T12:00:00Z");

test("weekIndex: Monday starts a week", () => {
  assert.equal(weekIndex(at("2026-11-02T00:00:00Z")), weekIndex(at("2026-11-08T23:59:59Z"))); // Mon..Sun
  assert.equal(weekIndex(at("2026-11-09T00:00:00Z")), weekIndex(at("2026-11-08T12:00:00Z")) + 1);
});

test("longestStreak counts consecutive weeks, not days", () => {
  assert.equal(longestStreak([]), null);
  const s = longestStreak([at("2026-01-05T10:00:00Z"), at("2026-01-07T10:00:00Z"), at("2026-01-14T10:00:00Z"), at("2026-01-21T10:00:00Z"), at("2026-02-11T10:00:00Z"), at("2026-02-18T10:00:00Z")])!;
  assert.equal(s.weeks, 3);
  assert.equal(new Date(s.from).toISOString().slice(0, 10), "2026-01-05");
  assert.equal(new Date(s.to).toISOString().slice(0, 10), "2026-01-19");
  assert.equal(longestStreak([at("2026-03-04T00:00:00Z")])!.weeks, 1);
});

test("years: only watched titles with a date; bad input means all time", () => {
  const lib = [item({ watchedAt: at("2025-05-01T00:00:00Z") }), item({ watchedAt: at("2026-01-01T00:00:00Z") }), item({}), item({ status: "watchlist", watchedAt: at("2020-01-01T00:00:00Z") })];
  assert.deepEqual(watchedYears(lib), [2026, 2025]);
  assert.equal(parseYear("2025", [2026, 2025]), 2025);
  assert.equal(parseYear("1999", [2026, 2025]), "all");
  assert.equal(parseYear(undefined, [2026]), "all");
  assert.equal(parseYear("abc", [2026]), "all");
  assert.equal(watchedIn(lib, "all").length, 3); // undated watched title counts for all time only
  assert.equal(watchedIn(lib, 2025).length, 1);
});

test("libraryStats: statuses, kinds, months, ratings, release years, decades", () => {
  const lib = [
    item({ year: "1994", rating: 5, watchedAt: at("2026-11-02T00:00:00Z") }),
    item({ year: "2019", rating: 3, type: "tv", watchedAt: at("2026-10-20T00:00:00Z") }),
    item({ year: "2021", rating: 4, watchedAt: at("2025-11-20T00:00:00Z") }), // exactly 12 months before: outside the window
    item({ year: "", watchedAt: at("2026-10-21T00:00:00Z") }),
    item({ status: "watchlist" }), item({ status: "watching" }),
  ];
  const s = libraryStats(lib, "all", NOW);
  assert.equal(s.total, 6);
  assert.deepEqual(s.byStatus, { watching: 1, partial: 0, watchlist: 1, watched: 4 });
  assert.equal(s.films, 3); assert.equal(s.series, 1);
  assert.equal(s.perMonth.length, 12);
  assert.equal(s.perMonth[11].label, "Nov 26"); assert.equal(s.perMonth[11].n, 1);
  assert.equal(s.perMonth[10].label, "Oct 26"); assert.equal(s.perMonth[10].n, 2);
  assert.equal(s.perMonth[0].label, "Dec 25");
  assert.deepEqual(s.perYear, [{ label: "2025", n: 1 }, { label: "2026", n: 3 }]);
  assert.deepEqual(s.ratings, [0, 0, 1, 1, 1]); assert.equal(s.rated, 3); assert.equal(s.avgRating, 4);
  assert.equal(s.oldest?.year, "1994"); assert.equal(s.newest?.year, "2021"); // the item with no year is ignored
  assert.deepEqual(s.decades, [{ label: "1990s", n: 1 }, { label: "2010s", n: 1 }, { label: "2020s", n: 1 }]);
  const y = libraryStats(lib, 2025, NOW);
  assert.equal(y.watched, 1); assert.equal(y.avgRating, 4); assert.equal(y.byStatus.watched, 4); // statuses stay library-wide
});

test("libraryStats on an empty library has no averages, streak or extremes", () => {
  const s = libraryStats([], "all", NOW);
  assert.equal(s.avgRating, null); assert.equal(s.streak, null); assert.equal(s.oldest, null); assert.deepEqual(s.perYear, []);
});

test("recentWatched: newest first, undated last, capped", () => {
  const a = item({ watchedAt: 1 }), b = item({ watchedAt: 3 }), c = item({}), d = item({ watchedAt: 2 });
  assert.deepEqual(recentWatched([a, c, b, d], 3).map((x) => x.key), [b.key, d.key, a.key]);
});

test("tmdbStats: films only are timed; series are counted as skipped; directors need two films", () => {
  const dir = (id: number) => ({ id, name: `D${id}` });
  const r = tmdbStats([
    { type: "movie", runtime: 120, genres: ["Drama", "Crime"], directors: [dir(1)] },
    { type: "movie", runtime: 100, genres: ["Drama"], directors: [dir(1), dir(2)] },
    { type: "movie", runtime: null, genres: ["Drama", "Drama"], directors: [] },
    { type: "tv", runtime: 45, genres: ["Crime"], directors: [dir(3), dir(3)] },
  ]);
  assert.equal(r.minutes, 220); assert.equal(r.filmsTimed, 2); assert.equal(r.filmsNoRuntime, 1); assert.equal(r.seriesSkipped, 1);
  assert.deepEqual(r.genres, [{ label: "Drama", n: 3 }, { label: "Crime", n: 2 }]);
  assert.deepEqual(r.directors, [{ id: 1, name: "D1", n: 2 }]);
});

test("formatHours", () => {
  assert.equal(formatHours(90), "2 h");
  assert.equal(formatHours(60 * 72), "72 h · 3.0 days");
});
