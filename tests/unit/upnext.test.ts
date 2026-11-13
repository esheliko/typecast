import test from "node:test";
import assert from "node:assert/strict";
import { bySource, because, lengthLabel, onYourServices, rankUpNext, realServices, type Facts } from "../../src/lib/upnext";
import type { LibItem } from "../../src/lib/types";

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-11-08T12:00:00Z");
let n = 0;
function lib(p: Partial<LibItem> & Pick<LibItem, "status">): LibItem {
  const id = ++n;
  return { key: `${p.type ?? "movie"}:${id}`, type: "movie", id, title: `T${id}`, year: "2020", poster: "/p.jpg", priority: "someday", rating: 0, note: "",
    progress: null, added: NOW - 100 * DAY, watchedAt: null, updated: NOW - 100 * DAY, ...p };
}
const facts = (p: Partial<Facts> = {}): Facts => ({ genres: [], vote: 7, votes: 1000, runtime: 100, released: "2020-01-01", lastAired: null, onMine: [], streamable: true, recs: [], ...p });
const ctx = (f: [LibItem, Facts][] = [], hasServices = false) => ({ now: NOW, facts: new Map(f.map(([l, x]) => [l.key, x])), hasServices });

test("a fresh in-progress title leads; an abandoned one sinks and is marked stale", () => {
  const fresh = lib({ status: "watching", type: "tv", updated: NOW - 3 * DAY, progress: { s: 2, e: 3 } });
  const old = lib({ status: "watching", updated: NOW - 200 * DAY });
  const wl = [1, 2, 3, 4].map(() => lib({ status: "watchlist" }));
  const out = rankUpNext([old, ...wl, fresh], ctx());
  assert.equal(out[0].key, fresh.key);
  assert.match(out[0].why, /S2 E3/);
  const st = out.find((p) => p.key === old.key)!;
  assert.equal(st.kind, "still");
  assert.ok(out.indexOf(st) > 3, "stale title is not near the front");
});

test("only one stale title is shown", () => {
  const stale = [1, 2, 3].map(() => lib({ status: "watching", updated: NOW - 300 * DAY }));
  const out = rankUpNext([...stale, lib({ status: "watchlist" })], ctx());
  assert.equal(out.filter((p) => p.kind === "still").length, 1);
});

test("a stale series with new episodes comes back as new episodes", () => {
  const s = lib({ status: "watching", type: "tv", updated: Date.parse("2026-01-01") });
  const out = rankUpNext([s], ctx([[s, facts({ lastAired: "2026-10-30" })]]));
  assert.equal(out[0].kind, "new-eps");
});

test("watchlist: on your services and recommended by a loved title beats a plain old entry", () => {
  const loved = lib({ status: "watched", rating: 5, title: "Loved" });
  const plain = lib({ status: "watchlist" });
  const good = lib({ status: "watchlist" });
  const out = rankUpNext([plain, good, loved], ctx([
    [loved, facts({ recs: [{ key: good.key, type: "movie", id: good.id, title: good.title, year: "2020", poster: "/x", vote: 8, votes: 900, genres: [], released: "2020-01-01" }] })],
    [plain, facts({ streamable: false })],
    [good, facts({ onMine: ["Netflix"] })],
  ], true));
  assert.equal(out[0].key, good.key);
  assert.equal(out[0].tag, "Netflix");
  assert.match(out[0].why, /Loved/);
});

test("unreleased watchlist titles and snoozed titles are left out", () => {
  const soon = lib({ status: "watchlist" });
  const hidden = lib({ status: "watchlist" });
  const ok = lib({ status: "watchlist" });
  const out = rankUpNext([soon, hidden, ok], ctx([[soon, facts({ released: "2027-05-01" })]]), new Set([hidden.key]));
  assert.deepEqual(out.map((p) => p.key), [ok.key]);
});

test("discoveries from loved titles are mixed in, never titles already in the library", () => {
  const loved = lib({ status: "watched", rating: 5 });
  const owned = lib({ status: "watched" });
  const wl = [1, 2, 3, 4, 5].map(() => lib({ status: "watchlist" }));
  const rec = (id: number, key = `movie:${id}`) => ({ key, type: "movie" as const, id, title: `R${id}`, year: "2019", poster: "/r", vote: 7.8, votes: 5000, genres: [], released: "2019-01-01" });
  const out = rankUpNext([loved, owned, ...wl], ctx([[loved, facts({ recs: [rec(9001), rec(owned.id, owned.key)] })]]));
  const disc = out.filter((p) => p.kind === "discover");
  assert.deepEqual(disc.map((p) => p.key), ["movie:9001"]);
});

test("must-watch outranks someday when nothing else is known", () => {
  const some = lib({ status: "watchlist" });
  const must = lib({ status: "watchlist", priority: "must" });
  assert.equal(rankUpNext([some, must], ctx())[0].key, must.key);
});

test("length labels", () => {
  assert.equal(lengthLabel("movie", 112), "1h 52m");
  assert.equal(lengthLabel("movie", 120), "2h");
  assert.equal(lengthLabel("movie", 45), "45m");
  assert.equal(lengthLabel("tv", 50), "50 min episodes");
  assert.equal(lengthLabel("movie", null), null);
});

test("'loved' only for titles rated 4+", () => {
  assert.equal(because([lib({ status: "watched", rating: 5, title: "A" })]), "Because you loved A");
  assert.equal(because([lib({ status: "watched", rating: 0, title: "B" }), lib({ status: "watched", rating: 5, title: "A" })]), "Because you watched A and B");
});

test("manual (negative) service ids are ignored", () => {
  assert.deepEqual(realServices([8, -1, 337, -42, 0]), [8, 337]);
});

test("'on my services' keeps only picks streaming on a chosen service, and they rank first", () => {
  const on = lib({ status: "watchlist" });
  const off = lib({ status: "watchlist", priority: "must" });
  const unknown = lib({ status: "watchlist" });
  const out = rankUpNext([off, on, unknown], ctx([[on, facts({ onMine: ["Netflix"] })], [off, facts({ streamable: false })]], true));
  assert.equal(out[0].key, on.key, "streamable beats an unavailable must-watch");
  assert.deepEqual(onYourServices(out).map((p) => p.key), [on.key]);
  assert.equal(out.find((p) => p.key === unknown.key)!.checked, false);
  assert.equal(out.find((p) => p.key === on.key)!.checked, true);
});

test("a series back from Watched with a new episode leads, flagged and named, even if it sat untouched", () => {
  const s = lib({ status: "watching", type: "tv", updated: NOW - 300 * DAY, newEp: { at: "2026-11-02", s: 3, e: 1, season: true } });
  const fresh = lib({ status: "watching", type: "tv", updated: NOW - 2 * DAY, progress: { s: 1, e: 2 } });
  const out = rankUpNext([fresh, s], ctx());
  assert.equal(out[0].key, s.key);
  assert.equal(out[0].kind, "new-eps");
  assert.equal(out[0].fresh, "season");
  assert.equal(out[0].why, "S3 E1 aired 2 Nov");
  assert.equal(out.find((p) => p.key === fresh.key)?.fresh, undefined);
});

test("an in-progress series says when its next episode airs, within a week", async () => {
  const { rankUpNext } = await import("../../src/lib/upnext");
  const now = Date.parse("2026-11-08T12:00:00Z");
  const s = lib({ key: "tv:9", type: "tv", id: 9, status: "watching", progress: { s: 2, e: 3 }, updated: now - 86400000 });
  const soon = rankUpNext([s], { now, facts: new Map([[s.key, facts({ nextAir: "2026-11-12" })]]), hasServices: false }, new Set(), 5);
  assert.match(soon[0].why, /new ep Thursday$/);
  const later = rankUpNext([s], { now, facts: new Map([[s.key, facts({ nextAir: "2026-11-30" })]]), hasServices: false }, new Set(), 5);
  assert.doesNotMatch(later[0].why, /new ep/);
});

test("bySource splits new picks from library picks", () => {
  const mk = (key: string, kind: "discover" | "library") => ({ key, kind }) as never;
  const picks = [mk("a", "library"), mk("b", "discover"), mk("c", "library")];
  assert.equal(bySource(picks, "both").length, 3);
  assert.deepEqual(bySource(picks, "new").map((p) => p.key), ["b"]);
  assert.deepEqual(bySource(picks, "library").map((p) => p.key), ["a", "c"]);
});

/* ---------- step 5B: continue wording, Watching never capped, Partly not a continue card, Still watching? ---------- */
import { continueHref, continueLabel, caughtUp, pickUpCards } from "../../src/lib/watch-library";
import { isStillWatching, STILL_WATCHING_DAYS } from "../../src/lib/upnext";
const SEAS = [{ n: 1, eps: 7 }, { n: 2, eps: 13 }, { n: 3, eps: 13 }];

test("continueLabel: next episode, rolling over a season end, no seasons, caught up, no progress", () => {
  assert.equal(continueLabel({ s: 3, e: 8 }, SEAS), "Next: S3 E9");
  assert.equal(continueLabel({ s: 1, e: 7 }, SEAS), "Next: S2 E1");
  assert.equal(continueLabel({ s: 3, e: 8 }), "After S3 E8");
  assert.equal(continueLabel({ s: 3, e: 8 }, []), "After S3 E8");
  assert.equal(continueLabel(null, SEAS), "Pick up where you left off");
  assert.equal(continueLabel(null), "Pick up where you left off");
  // the last known episode finished: nothing follows
  assert.equal(continueLabel({ s: 3, e: 13 }, SEAS), "Caught up");
  // the continue episode has not aired yet (S3 E9 is next, but the newest aired is S3 E8)
  assert.equal(continueLabel({ s: 3, e: 8 }, SEAS, { s: 3, e: 8 }), "Caught up");
  assert.equal(continueLabel({ s: 3, e: 8 }, SEAS, { s: 3, e: 9 }), "Next: S3 E9");
  assert.equal(caughtUp({ s: 3, e: 8 }, undefined, { s: 3, e: 8 }), false, "without season sizes nobody can tell");
});

test("continueHref opens at the episode after the progress; pickUpCards hrefs stay as they were", () => {
  const row = { key: "tv:1396", type: "tv" as const, status: "watching" as const, progress: { s: 2, e: 3 } };
  assert.equal(continueHref(row), "/watching?k=tv-1396&s=2&e=4");
  assert.equal(continueHref({ ...row, progress: { s: 1, e: 7 } }, SEAS), "/watching?k=tv-1396&s=2&e=1");
  assert.equal(continueHref({ ...row, progress: null }), "/watching?k=tv-1396");
  assert.equal(continueHref({ ...row, key: "movie:5", type: "movie" }), "/watching?k=movie-5");
  const cards = pickUpCards([{ ...row, title: "BB", poster: null, updated: 1 }]);
  assert.equal(cards[0].href, "/watching?k=tv-1396&s=2&e=4");
  assert.equal(cards[0].place, "after S2 E3");
});

test("a continue card says Next: and carries the Continue link; caught up has no link and keeps the new-ep text", () => {
  const s = lib({ status: "watching", type: "tv", updated: NOW - 2 * DAY, progress: { s: 2, e: 3 } });
  const f = facts({ seasons: SEAS, lastEp: { s: 2, e: 13 }, lastAired: "2026-11-01" });
  const [p] = rankUpNext([s], ctx([[s, f]]));
  assert.equal(p.kind, "continue");
  assert.equal(p.why, "S2 E4 · out now"); // was "Next: S2 E4": a continue card whose episode is out now says so
  assert.equal(p.go, `/watching?k=${s.key.replace(":", "-")}&s=2&e=4`);
  const [nf] = rankUpNext([s], ctx());
  assert.equal(nf.why, "After S2 E3");
  const c = lib({ status: "watching", type: "tv", updated: NOW - 2 * DAY, progress: { s: 3, e: 8 } });
  const [cu] = rankUpNext([c], ctx([[c, facts({ seasons: SEAS, lastEp: { s: 3, e: 8 }, nextAir: "2026-11-12", lastAired: "2026-11-05" })]]));
  assert.match(cu.why, /^Caught up · new ep /);
  assert.equal(cu.go, undefined);
});

test("a continue card carries the episode's runtime; an episode that has not aired is not 'out now'", () => {
  const s = lib({ status: "watching", type: "tv", updated: NOW - 2 * DAY, progress: { s: 2, e: 3 } });
  const [p] = rankUpNext([s], ctx([[s, facts({ seasons: SEAS, lastEp: { s: 2, e: 13 }, runtime: 47, lastAired: "2026-11-01" })]]));
  assert.equal(p.why, "S2 E4 · out now");
  assert.equal(p.length, "47 min");
  const [u] = rankUpNext([s], ctx([[s, facts({ seasons: SEAS, lastEp: { s: 2, e: 3 }, runtime: 47, lastAired: "2026-11-01" })]]));
  assert.equal(u.go, undefined);
  assert.doesNotMatch(u.why, /out now/);
});

test("every fresh Watching title leads: not capped at 4, never dropped for a lower card", () => {
  const w = [1, 2, 3, 4, 5, 6].map((i) => lib({ status: "watching", type: "tv", updated: NOW - i * DAY, progress: { s: 1, e: i } }));
  const wl = [1, 2, 3].map(() => lib({ status: "watchlist" }));
  const out = rankUpNext([...wl, ...w], ctx(), new Set(), 8);
  assert.deepEqual(out.slice(0, 6).map((p) => p.key).sort(), w.map((x) => x.key).sort());
  const tight = rankUpNext([...wl, ...w], ctx(), new Set(), 6);
  assert.equal(tight.filter((p) => p.kind === "continue").length, 6);
});

test("Partly watched is not a continue card, but a new-episodes card when something aired after your last touch", () => {
  const quiet = lib({ status: "partial", type: "tv", updated: NOW - 2 * DAY, progress: { s: 1, e: 2 } });
  assert.deepEqual(rankUpNext([quiet], ctx()), []);
  const p = lib({ status: "partial", type: "tv", updated: NOW - 100 * DAY, progress: { s: 1, e: 2 } });
  const [o] = rankUpNext([p], ctx([[p, facts({ lastAired: "2026-11-01" })]]));
  assert.equal(o.kind, "new-eps");
  assert.match(o.why, /after S1 E2/);
  const w = lib({ status: "watching", type: "tv", updated: NOW - 3 * DAY });
  const out = rankUpNext([p, w], ctx([[p, facts({ lastAired: "2026-11-01" })]]));
  assert.equal(out[0].key, w.key, "Watching leads Partly");
});

test("Still watching?: only Watching, only after 42 days, never with a new episode, at most one", () => {
  const old = (o: Partial<LibItem>) => lib({ status: "watching", type: "tv", updated: NOW - (STILL_WATCHING_DAYS + 1) * DAY, ...o });
  assert.equal(isStillWatching(old({}), NOW), true);
  assert.equal(isStillWatching(lib({ status: "watching", updated: NOW - STILL_WATCHING_DAYS * DAY }), NOW), false, "exactly 42 days is not past it");
  assert.equal(isStillWatching(lib({ status: "watching", updated: NOW - 41 * DAY }), NOW), false);
  assert.equal(isStillWatching(old({ status: "partial" }), NOW), false);
  assert.equal(isStillWatching(old({ newEp: { season: false, ep: 1, season_n: 1, ep_n: 1, air: "2026-11-01" } as unknown as LibItem["newEp"] }), NOW), false);
  assert.equal(isStillWatching(old({}), NOW, true), false, "an aired episode newer than the last touch");
  const three = [1, 2, 3].map((i) => old({ updated: NOW - (50 + i) * DAY }));
  const out = rankUpNext(three, ctx());
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "still");
  assert.equal(out[0].key, three[0].key, "the most recently touched one is asked about");
  const between = lib({ status: "watching", type: "tv", updated: NOW - 30 * DAY, progress: { s: 1, e: 1 } });
  assert.equal(rankUpNext([between], ctx())[0].kind, "continue");
});
