import test from "node:test";
import assert from "node:assert/strict";
import { because, lengthLabel, onYourServices, rankUpNext, realServices, type Facts } from "../../src/lib/upnext";
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
  const old = lib({ status: "partial", updated: NOW - 200 * DAY });
  const wl = [1, 2, 3, 4].map(() => lib({ status: "watchlist" }));
  const out = rankUpNext([old, ...wl, fresh], ctx());
  assert.equal(out[0].key, fresh.key);
  assert.match(out[0].why, /S2 E3/);
  const st = out.find((p) => p.key === old.key)!;
  assert.equal(st.kind, "stale");
  assert.ok(out.indexOf(st) > 3, "stale title is not near the front");
});

test("only one stale title is shown", () => {
  const stale = [1, 2, 3].map(() => lib({ status: "partial", updated: NOW - 300 * DAY }));
  const out = rankUpNext([...stale, lib({ status: "watchlist" })], ctx());
  assert.equal(out.filter((p) => p.kind === "stale").length, 1);
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
  assert.equal(lengthLabel("tv", 50), "50m eps");
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
