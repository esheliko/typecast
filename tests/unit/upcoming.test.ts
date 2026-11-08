import test from "node:test";
import assert from "node:assert/strict";
import { buildEntry, candidates, countdown, dateLabel, episodeNote, groupUpcoming, isSoon, subLine, type UpEntry } from "../../src/lib/upcoming";
import type { LibItem } from "../../src/lib/types";

const TODAY = "2026-11-08"; // a Sunday
const DAY = 24 * 3600 * 1000;
let n = 0;
function lib(p: Partial<LibItem> & Pick<LibItem, "status">): LibItem {
  const id = ++n;
  return { key: `${p.type ?? "movie"}:${id}`, type: "movie", id, title: `T${id}`, year: "2026", poster: null, priority: "someday", rating: 0, note: "",
    progress: null, added: 0, watchedAt: null, updated: 1000 * DAY, ...p };
}
const entry = (p: Partial<UpEntry> & { date: string }): UpEntry => ({ key: `movie:${++n}`, type: "movie", id: n, title: `E${n}`, year: "2026", poster: null, kind: "film", code: null, note: null, must: false, svc: null, approx: false, ...p });

test("films already out are not looked up; series always are", () => {
  const old = lib({ status: "watchlist", year: "2019" });
  const thisYear = lib({ status: "watchlist", year: "2026" });
  const noYear = lib({ status: "watchlist", year: "" });
  const watchedFilm = lib({ status: "watched", year: "2026" });
  const endedSeries = lib({ status: "watched", type: "tv", year: "2008" });
  const keys = candidates([old, thisYear, noYear, watchedFilm, endedSeries], TODAY).map((l) => l.key);
  assert.deepEqual(new Set(keys), new Set([thisYear.key, noYear.key, endedSeries.key]));
});

test("candidates: series in progress first, then must-watch films, then watched series; capped", () => {
  const some = lib({ status: "watchlist" });
  const watched = lib({ status: "watched", type: "tv", updated: 2000 * DAY });
  const must = lib({ status: "watchlist", priority: "must" });
  const going = lib({ status: "watching", type: "tv" });
  assert.deepEqual(candidates([some, watched, must, going], TODAY).map((l) => l.key), [going.key, must.key, watched.key, some.key]);
  assert.equal(candidates([some, watched, must, going], TODAY, 2).length, 2);
});

test("an entry needs a future (or today's) date", () => {
  const film = lib({ status: "watchlist" });
  assert.equal(buildEntry(film, null, TODAY), null);
  assert.equal(buildEntry(film, { date: "" }, TODAY), null);
  assert.equal(buildEntry(film, { date: "2026-11-07" }, TODAY), null);
  assert.equal(buildEntry(film, { date: "2028-12-31" }, TODAY), null, "beyond the horizon");
  assert.equal(buildEntry(film, { date: TODAY }, TODAY)?.date, TODAY);
});

test("series entries carry the episode code and a season note", () => {
  const tv = lib({ status: "watching", type: "tv" });
  const e = buildEntry(tv, { date: "2026-11-12", s: 5, e: 1, svc: "Disney+" }, TODAY)!;
  assert.equal(e.code, "S5 E1");
  assert.equal(e.note, "New season");
  assert.equal(subLine(e), "S5 E1 · New season");
  assert.equal(e.svc, "Disney+");
  assert.equal(buildEntry(tv, { date: "2026-11-12", s: 5, e: 4 }, TODAY)!.note, null);
  assert.equal(episodeNote(1, 1), "Premiere");
  assert.equal(episodeNote(2, 1), "New season");
  assert.equal(episodeNote(2, 2), null);
});

test("films: must-watch note, and a far date shows its month only", () => {
  const must = lib({ status: "watchlist", priority: "must" });
  const near = buildEntry(must, { date: "2026-12-18" }, TODAY)!;
  assert.equal(near.note, "Must watch");
  assert.equal(subLine(near), "Film · Must watch");
  assert.equal(near.approx, false);
  const far = buildEntry(lib({ status: "watchlist" }), { date: "2027-06-30" }, TODAY)!;
  assert.equal(far.approx, true);
  assert.equal(dateLabel(far, TODAY), "Jun 2027");
  assert.equal(countdown(far, TODAY), "date may change");
  // A series' next episode is never approximate.
  assert.equal(buildEntry(lib({ status: "watching", type: "tv" }), { date: "2027-06-30", s: 2, e: 1 }, TODAY)!.approx, false);
});

test("date and countdown text", () => {
  const e = entry({ date: "2026-11-12" });
  assert.equal(dateLabel(e, TODAY), "Thu 12 Nov");
  assert.equal(countdown(e, TODAY), "in 4 days");
  assert.equal(dateLabel(entry({ date: "2027-01-08" }), TODAY), "Fri 8 Jan 2027");
  assert.equal(isSoon(entry({ date: TODAY }), TODAY), true);
  assert.equal(isSoon(entry({ date: "2026-11-09" }), TODAY), true);
  assert.equal(isSoon(entry({ date: "2026-11-10" }), TODAY), false);
});

test("groups: this week, this month, then one per later month, each sorted", () => {
  const list = [
    entry({ date: "2026-12-18", title: "Dune" }),
    entry({ date: "2026-11-20", title: "Hunger" }),
    entry({ date: "2026-11-14", title: "Slow" }),
    entry({ date: "2026-11-15", title: "Bear" }),
    entry({ date: "2026-12-02", title: "Mid" }),
    entry({ date: "2027-01-10", title: "Next year" }),
    entry({ date: "2026-11-08", title: "Today" }),
  ];
  const g = groupUpcoming(list, TODAY);
  assert.deepEqual(g.map((x) => x.label), ["This week", "This month", "December", "January 2027"]);
  assert.deepEqual(g[0].entries.map((e) => e.title), ["Today", "Slow", "Bear"]);
  assert.deepEqual(g[1].entries.map((e) => e.title), ["Hunger"]);
  assert.deepEqual(g[2].entries.map((e) => e.title), ["Mid", "Dune"]);
});

test("same day: must-watch first", () => {
  const g = groupUpcoming([entry({ date: "2026-11-10", title: "A" }), entry({ date: "2026-11-10", title: "B", must: true })], TODAY);
  assert.deepEqual(g[0].entries.map((e) => e.title), ["B", "A"]);
});

test("nothing to group", () => {
  assert.deepEqual(groupUpcoming([], TODAY), []);
});
