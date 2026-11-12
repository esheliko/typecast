import { test } from "node:test";
import assert from "node:assert/strict";
import { openingPos, pickUpCards, restorePlan, resumePlace, shouldSavePlace, startPlan } from "../../src/lib/watch-library";

test("startPlan: missing, To watch and Partly are promoted and remembered; Watching and Watched are left alone", () => {
  assert.deepEqual(startPlan(null, "tv", { s: 1, e: 1 }), { promote: true, prev: { st: "none", s: 1, e: 1 } });
  assert.deepEqual(startPlan(undefined, "movie", null), { promote: true, prev: { st: "none" } });
  assert.deepEqual(startPlan({ status: "watchlist", priority: "someday" }, "tv", { s: 2, e: 4 }), { promote: true, prev: { st: "watchlist", s: 2, e: 4 } });
  assert.deepEqual(startPlan({ status: "watchlist", priority: "must" }, "movie", null), { promote: true, prev: { st: "must" } });
  assert.deepEqual(startPlan({ status: "partial", priority: "someday" }, "tv", { s: 3, e: 8 }), { promote: true, prev: { st: "partial", s: 3, e: 8 } });
  assert.deepEqual(startPlan({ status: "watching", priority: "someday" }, "tv", { s: 3, e: 8 }), { promote: false });
  assert.deepEqual(startPlan({ status: "watched", priority: "someday" }, "tv", { s: 3, e: 8 }), { promote: false });
});

const tvW = { type: "tv" as const, s: 1, e: 1 };
test("restorePlan: only a promoted title that is still Watching is put back", () => {
  const w = (st: "none" | "watchlist" | "must" | "partial", over = {}) => ({ ...tvW, prev: { st, s: 1, e: 1 }, ...over });
  assert.deepEqual(restorePlan(w("partial"), { status: "watching", rich: false }), { do: "set", status: "partial", priority: "someday" });
  assert.deepEqual(restorePlan(w("watchlist"), { status: "watching", rich: false }), { do: "set", status: "watchlist", priority: "someday" });
  assert.deepEqual(restorePlan(w("must"), { status: "watching", rich: false }), { do: "set", status: "watchlist", priority: "must" });
  // no prev (the title was already Watching or Watched), or the status was changed meanwhile
  assert.deepEqual(restorePlan({ ...tvW }, { status: "watching", rich: false }), { do: "nothing" });
  assert.deepEqual(restorePlan(w("partial"), { status: "watched", rich: false }), { do: "nothing" });
  assert.deepEqual(restorePlan(w("partial"), null), { do: "nothing" });
});

test("restorePlan: a title that was not in the library is removed only if nothing was added", () => {
  const w = (over = {}) => ({ ...tvW, prev: { st: "none" as const, s: 1, e: 1 }, ...over });
  assert.deepEqual(restorePlan(w(), { status: "watching", rich: false }), { do: "remove" });
  assert.deepEqual(restorePlan(w({ e: 2 }), { status: "watching", rich: false }), { do: "nothing" });
  assert.deepEqual(restorePlan(w({ s: 2 }), { status: "watching", rich: false }), { do: "nothing" });
  assert.deepEqual(restorePlan(w(), { status: "watching", rich: true }), { do: "nothing" });
  // a film has no place
  assert.deepEqual(restorePlan({ type: "movie", prev: { st: "none" } }, { status: "watching", rich: false }), { do: "remove" });
});

test("resumePlace: Watching, Partly and Watched with a place; never Watchlist or no place", () => {
  const p = { s: 3, e: 8 };
  assert.deepEqual(resumePlace({ status: "watching", progress: p }), p);
  assert.deepEqual(resumePlace({ status: "partial", progress: p }), p);
  assert.deepEqual(resumePlace({ status: "watched", progress: p }), p);
  assert.equal(resumePlace({ status: "watchlist", progress: p }), null);
  assert.equal(resumePlace({ status: "watching", progress: null }), null);
  assert.equal(resumePlace({ status: "watching", progress: { s: 0, e: 0 } }), null);
  assert.equal(resumePlace(null), null);
});

test("openingPos: URL first, then this device's watch, then the library, else not set", () => {
  const url = { s: 1, e: 2 }, watch = { s: 4, e: 5 }, lib = { s: 3, e: 8 };
  assert.deepEqual(openingPos(true, url, watch, lib), url);
  assert.deepEqual(openingPos(false, { s: null, e: null }, watch, lib), watch);
  assert.deepEqual(openingPos(false, { s: null, e: null }, null, lib), lib);
  assert.deepEqual(openingPos(false, { s: null, e: null }, null, null), { s: null, e: null });
  // `?s=2` alone is an explicit season: it is not replaced by the saved place
  assert.deepEqual(openingPos(true, { s: 2, e: null }, null, lib), { s: 2, e: null });
});

test("shouldSavePlace: only an exact episode of a series that is Watching", () => {
  assert.equal(shouldSavePlace("watching", "tv", { s: 2, e: 3 }), true);
  assert.equal(shouldSavePlace("partial", "tv", { s: 2, e: 3 }), false);
  assert.equal(shouldSavePlace("watched", "tv", { s: 2, e: 3 }), false);
  assert.equal(shouldSavePlace(undefined, "tv", { s: 2, e: 3 }), false);
  assert.equal(shouldSavePlace("watching", "movie", { s: 2, e: 3 }), false);
  assert.equal(shouldSavePlace("watching", "tv", { s: 2, e: null }), false);
  assert.equal(shouldSavePlace("watching", "tv", { s: null, e: null }), false);
});

test("pickUpCards: Watching only, newest first, at most 6, with a place and a link", () => {
  const row = (n: number, over = {}) => ({ key: `tv:${n}`, type: "tv" as const, title: `T${n}`, poster: null, status: "watching" as const, progress: { s: 3, e: 8 }, updated: n, ...over });
  const rows = [row(1), row(2, { status: "watched" }), row(3, { status: "partial" }), ...[4, 5, 6, 7, 8, 9].map((n) => row(n)), row(10, { type: "movie", key: "movie:10", progress: null }), row(11, { progress: null })];
  const cards = pickUpCards(rows);
  assert.equal(cards.length, 6);
  assert.deepEqual(cards.map((c) => c.title), ["T11", "T10", "T9", "T8", "T7", "T6"]);
  assert.equal(cards[0].place, null);
  assert.equal(cards[0].href, "/watching?k=tv-11");
  assert.equal(cards[1].href, "/watching?k=movie-10");
  assert.equal(cards[2].place, "S3 E8");
  assert.equal(cards[2].href, "/watching?k=tv-9&s=3&e=8");
  assert.deepEqual(pickUpCards([row(1, { status: "watchlist" })]), []);
});
