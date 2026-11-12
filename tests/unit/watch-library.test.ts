import { test } from "node:test";
import assert from "node:assert/strict";
import { continuePlace, episodeOrdinal, filmDone, forwardSave, isAhead, isLastEpisode, needsPromotion, nextWrite, normalizePlace, openingPos, pickUpCards, placeToProgress, restorePlan, resumePlace, revertDecision, REVERT_AFTER_MS, REVERT_DROP_MS, seriesEnded, shouldSavePlace, startPlan, switchCards } from "../../src/lib/watch-library";

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

test("resumePlace: the episode AFTER the saved progress; Watching, Partly and Watched; never Watchlist or no progress", () => {
  const p = { s: 3, e: 8 }, next = { s: 3, e: 9 };
  assert.deepEqual(resumePlace({ status: "watching", progress: p }), next);
  assert.deepEqual(resumePlace({ status: "partial", progress: p }), next);
  assert.deepEqual(resumePlace({ status: "watched", progress: p }), next);
  assert.equal(resumePlace({ status: "watchlist", progress: p }), null);
  assert.equal(resumePlace({ status: "watching", progress: null }), null);
  assert.equal(resumePlace({ status: "watching", progress: { s: 0, e: 0 } }), null);
  assert.equal(resumePlace(null), null);
  // with season sizes it rolls into the next season after a season's last episode
  assert.deepEqual(resumePlace({ status: "watching", progress: { s: 1, e: 10 } }, SEASONS), { s: 2, e: 1 });
});

const SEASONS = [{ n: 0, eps: 3 }, { n: 1, eps: 10 }, { n: 2, eps: 12 }, { n: 3, eps: 8 }];

test("placeToProgress: the episode before the page place; nothing for S1 E1, unknown previous seasons and specials", () => {
  assert.deepEqual(placeToProgress({ s: 3, e: 8 }, SEASONS), { s: 3, e: 7 });
  assert.deepEqual(placeToProgress({ s: 1, e: 2 }, SEASONS), { s: 1, e: 1 });
  // season boundary: E1 of a season is "finished the previous season's last episode"
  assert.deepEqual(placeToProgress({ s: 2, e: 1 }, SEASONS), { s: 1, e: 10 });
  assert.deepEqual(placeToProgress({ s: 3, e: 1 }, SEASONS), { s: 2, e: 12 });
  // the very first episode, or a previous season whose size is unknown: nothing to write
  assert.equal(placeToProgress({ s: 1, e: 1 }, SEASONS), null);
  assert.equal(placeToProgress({ s: 2, e: 1 }, []), null);
  // specials are never saved (and never counted as a previous season)
  assert.equal(placeToProgress({ s: 0, e: 2 }, SEASONS), null);
  assert.equal(placeToProgress({ s: 1, e: 1 }, [{ n: 0, eps: 3 }, { n: 1, eps: 10 }]), null);
  assert.equal(placeToProgress(null, SEASONS), null);
});

test("continuePlace: the episode after the progress, rolling over a season end only when sizes are known", () => {
  assert.deepEqual(continuePlace({ s: 3, e: 7 }), { s: 3, e: 8 });
  assert.deepEqual(continuePlace({ s: 1, e: 10 }), { s: 1, e: 11 }); // unsized: the page normalises it
  assert.deepEqual(continuePlace({ s: 1, e: 10 }, SEASONS), { s: 2, e: 1 });
  assert.deepEqual(continuePlace({ s: 3, e: 8 }, SEASONS), { s: 3, e: 8 }); // nothing follows: stay on the last episode
  assert.equal(continuePlace(null), null);
  assert.equal(continuePlace({ s: 0, e: 2 }, SEASONS), null);
  // both directions agree: the place maps to progress and back to the same place
  for (const p of [{ s: 1, e: 2 }, { s: 2, e: 1 }, { s: 3, e: 8 }, { s: 2, e: 12 }]) assert.deepEqual(continuePlace(placeToProgress(p, SEASONS), SEASONS), p);
});

test("normalizePlace: a number past a season's end rolls to the next season", () => {
  assert.deepEqual(normalizePlace({ s: 1, e: 11 }, SEASONS), { s: 2, e: 1 });
  assert.deepEqual(normalizePlace({ s: 1, e: 10 }, SEASONS), { s: 1, e: 10 });
  assert.deepEqual(normalizePlace({ s: 3, e: 9 }, SEASONS), { s: 3, e: 9 }); // no later season: left alone
  assert.deepEqual(normalizePlace({ s: 9, e: 1 }, SEASONS), { s: 9, e: 1 }); // unknown season: left alone
});

test("episodeOrdinal and isAhead", () => {
  assert.equal(episodeOrdinal({ s: 1, e: 1 }, SEASONS), 1);
  assert.equal(episodeOrdinal({ s: 2, e: 1 }, SEASONS), 11);
  assert.equal(episodeOrdinal({ s: 0, e: 1 }, SEASONS), null);
  assert.equal(isAhead({ s: 1, e: 2 }, null), true);
  assert.equal(isAhead({ s: 2, e: 1 }, { s: 1, e: 10 }), true);
  assert.equal(isAhead({ s: 1, e: 5 }, { s: 1, e: 5 }), false);
  assert.equal(isAhead({ s: 1, e: 4 }, { s: 1, e: 5 }), false);
});

test("forwardSave: forward only; a single step is silent, a bigger jump is announced", () => {
  const saved = { s: 3, e: 7 }; // place to continue with: S3 E8
  assert.deepEqual(forwardSave({ s: 3, e: 9 }, saved, SEASONS), { write: { s: 3, e: 8 }, jump: false });
  assert.deepEqual(forwardSave({ s: 3, e: 8 }, saved, SEASONS), null); // equal: nothing
  assert.deepEqual(forwardSave({ s: 3, e: 5 }, saved, SEASONS), null); // earlier episode's cast: never lowers
  assert.deepEqual(forwardSave({ s: 1, e: 1 }, saved, SEASONS), null);
  assert.deepEqual(forwardSave({ s: 3, e: 8 }, { s: 3, e: 6 }, SEASONS), { write: { s: 3, e: 7 }, jump: false });
  assert.deepEqual(forwardSave({ s: 3, e: 12 }, { s: 3, e: 5 }, SEASONS), { write: { s: 3, e: 11 }, jump: true });
  assert.equal(forwardSave({ s: 3, e: 12 }, saved, SEASONS)?.jump, true);
  // across a season boundary: S1E10 saved, place S2E1 is one step from S1E11? no: continue place is S2E1 itself
  assert.deepEqual(forwardSave({ s: 2, e: 2 }, { s: 1, e: 9 }, SEASONS), { write: { s: 2, e: 1 }, jump: true });
  assert.deepEqual(forwardSave({ s: 2, e: 1 }, { s: 1, e: 9 }, SEASONS), { write: { s: 1, e: 10 }, jump: false });
  // no progress yet: place S1E2 is one step from the start, S1E5 is a jump; S1E1 writes nothing
  assert.deepEqual(forwardSave({ s: 1, e: 2 }, null, SEASONS), { write: { s: 1, e: 1 }, jump: false });
  assert.equal(forwardSave({ s: 1, e: 5 }, null, SEASONS)?.jump, true);
  assert.equal(forwardSave({ s: 1, e: 1 }, null, SEASONS), null);
  assert.equal(forwardSave({ s: 0, e: 4 }, null, SEASONS), null); // specials
});

test("nextWrite: the episode you were on is watched, only when beyond the saved progress", () => {
  assert.deepEqual(nextWrite("watching", { s: 3, e: 8 }, { s: 3, e: 7 }), { s: 3, e: 8 });
  assert.deepEqual(nextWrite("watching", { s: 1, e: 1 }, null), { s: 1, e: 1 });
  assert.equal(nextWrite("watching", { s: 3, e: 8 }, { s: 3, e: 8 }), null);
  assert.equal(nextWrite("watching", { s: 3, e: 8 }, { s: 3, e: 20 }), null); // never lowers
  // a rewatch: a Watched title with no progress means "all of it" and stays so; with progress it only moves forward
  assert.equal(nextWrite("watched", { s: 1, e: 2 }, null), null);
  assert.deepEqual(nextWrite("watched", { s: 1, e: 5 }, { s: 1, e: 2 }), { s: 1, e: 5 });
  assert.equal(nextWrite("watching", null, { s: 1, e: 2 }), null);
  assert.equal(nextWrite("watching", { s: 0, e: 2 }, null), null);
});

test("needsPromotion, isLastEpisode, seriesEnded, filmDone", () => {
  assert.equal(needsPromotion(null), true);
  assert.equal(needsPromotion({ status: "watchlist", priority: "must" }), true);
  assert.equal(needsPromotion({ status: "partial", priority: "someday" }), true);
  assert.equal(needsPromotion({ status: "watching", priority: "someday" }), false);
  assert.equal(needsPromotion({ status: "watched", priority: "someday" }), false);
  assert.equal(isLastEpisode({ s: 3, e: 8 }, SEASONS), true);
  assert.equal(isLastEpisode({ s: 3, e: 7 }, SEASONS), false);
  assert.equal(isLastEpisode({ s: 2, e: 12 }, SEASONS), false);
  assert.equal(isLastEpisode({ s: 3, e: 8 }, [...SEASONS, { n: 4, eps: 0 }]), true); // an empty announced season does not count
  assert.equal(isLastEpisode({ s: 3, e: 8 }, []), false);
  assert.equal(seriesEnded("Ended"), true);
  assert.equal(seriesEnded("Canceled"), true);
  assert.equal(seriesEnded("Returning Series"), false);
  assert.equal(filmDone(120, 120), true);
  assert.equal(filmDone(119, 120), false);
  assert.equal(filmDone(500, null), false);
});

test("revertDecision: Partly-origin promotions go back after 12 h of nothing, quietly and only when still Watching", () => {
  const now = 1_000_000_000_000;
  const rec = (ago: number) => ({ prev: "partial" as const, lastActive: now - ago });
  const o = (over = {}) => ({ now, activeWatch: false, status: "watching" as const, ...over });
  assert.equal(revertDecision(rec(REVERT_AFTER_MS + 1), o()), "revert");
  assert.equal(revertDecision(rec(REVERT_AFTER_MS - 1000), o()), "keep");
  assert.equal(revertDecision(rec(REVERT_AFTER_MS + 1), o({ activeWatch: true })), "keep");
  // the user changed the status themselves: forget it, do not touch the title
  assert.equal(revertDecision(rec(REVERT_AFTER_MS + 1), o({ status: "watched" })), "drop");
  assert.equal(revertDecision(rec(REVERT_AFTER_MS + 1), o({ status: "partial" })), "drop");
  assert.equal(revertDecision(rec(1000), o({ status: undefined })), "drop");
  assert.equal(revertDecision(rec(REVERT_DROP_MS + 1), o()), "drop");
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
  assert.equal(cards[2].place, "S3 E9"); // the episode to CONTINUE with, after the one watched up to
  assert.equal(cards[2].href, "/watching?k=tv-9&s=3&e=9");
  assert.deepEqual(pickUpCards([row(1, { status: "watchlist" })]), []);
});

test("switchCards: the other Watching titles, never the current one, newest first, at most 6, only title poster and place", () => {
  const row = (n: number, over = {}) => ({ key: `tv:${n}`, type: "tv" as const, title: `T${n}`, poster: null, status: "watching" as const, progress: { s: 3, e: 8 }, updated: n, ...over });
  const rows = [row(1), row(2), row(3, { status: "watched" }), ...[4, 5, 6, 7, 8, 9].map((n) => row(n))];
  const cards = switchCards(rows, "tv:9");
  assert.deepEqual(cards.map((c) => c.title), ["T8", "T7", "T6", "T5", "T4", "T2"]);
  assert.deepEqual(Object.keys(cards[0]).sort(), ["href", "key", "place", "poster", "title"]);
  assert.equal(cards[0].href, "/watching?k=tv-8&s=3&e=9");
  assert.deepEqual(switchCards([row(1)], "tv:1"), []);
  assert.deepEqual(switchCards([row(1, { status: "partial" })], "tv:2"), []);
  assert.equal(switchCards([row(5, { type: "movie", key: "movie:5", progress: null })], "tv:1")[0].place, null);
});
