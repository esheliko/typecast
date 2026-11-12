import { test } from "node:test";
import assert from "node:assert/strict";
import { elapsedMin, setPaused, shiftWatch, parseWatch, factButtons, serializeWatch, whereLabel, WATCH_MAX_MS, type Watch } from "../../src/lib/watching";

const now = 1_800_000_000_000;
const film: Watch = { key: "movie:1", type: "movie", id: 1, title: "Heat", year: "1995", poster: "/p.jpg", started: now - 42 * 60000, runtime: 170 };

test("round-trips through the cookie value", () => {
  assert.deepEqual(parseWatch(serializeWatch(film), now), film);
  assert.deepEqual(parseWatch(JSON.stringify(film), now), film);
});

test("rejects junk, stale and future watches", () => {
  assert.equal(parseWatch(undefined, now), null);
  assert.equal(parseWatch("not json", now), null);
  assert.equal(parseWatch(JSON.stringify({ ...film, type: "book" }), now), null);
  assert.equal(parseWatch(JSON.stringify({ ...film, started: now - WATCH_MAX_MS - 1 }), now), null);
  assert.equal(parseWatch(JSON.stringify({ ...film, started: now + 3600_000 }), now), null);
});

test("series always carry an episode, films never do", () => {
  const tv = parseWatch(JSON.stringify({ ...film, key: "tv:1", type: "tv" }), now)!;
  assert.equal(tv.s, 1); assert.equal(tv.e, 1);
  assert.equal(parseWatch(JSON.stringify({ ...film, s: 3 }), now)!.s, undefined);
});

test("labels how far in", () => {
  assert.equal(elapsedMin(film, now), 42);
  assert.equal(whereLabel(film, now), "42 of 170 min");
  assert.equal(whereLabel({ ...film, runtime: 30 }, now), "30 of 30 min");
  assert.equal(whereLabel({ ...film, type: "tv", s: 2, e: 5, runtime: null }, now), "S2 E5 · 42 min in");
});

test("fact buttons fit the kind of title", () => {
  assert.ok(factButtons("tv").some((f) => /episode/i.test(f.label)));
  assert.ok(factButtons("movie").some((f) => /post-credits/i.test(f.label)));
  assert.ok(!factButtons("tv").some((f) => /post-credits/i.test(f.label)));
});

test("every fact button reaches its own answer", async () => {
  const { parseQuestion } = await import("../../src/lib/ask-intent");
  for (const type of ["movie", "tv"] as const) {
    for (const b of factButtons(type)) assert.notEqual(parseQuestion(b.q, []).kind, "search", `${type}: ${b.label}`);
  }
});

test("pausing stops the minutes and resuming carries on from there", () => {
  const now = Date.now();
  const w: Watch = { key: "movie:1", type: "movie", id: 1, title: "T", year: "2000", poster: null, started: now - 42 * 60000, runtime: 120 };
  const p = setPaused(w, true, now);
  assert.equal(elapsedMin(p, now + 30 * 60000), 42);
  assert.match(whereLabel(p, now), /paused/);
  const r = setPaused(p, false, now + 30 * 60000);
  assert.equal(r.paused, undefined);
  assert.equal(elapsedMin(r, now + 30 * 60000), 42);
  assert.equal(elapsedMin(r, now + 40 * 60000), 52);
  assert.equal(elapsedMin(shiftWatch(p, 5, now + 9e6), now + 9e6), 47);
  assert.equal(parseWatch(serializeWatch(p), now)?.paused, now);
});

test("prev: round-trips, and junk prev is dropped without losing the watch", () => {
  const tv: Watch = { key: "tv:5", type: "tv", id: 5, title: "Show", year: "2020", poster: null, started: now - 60000, runtime: 45, s: 2, e: 3, prev: { st: "watchlist", s: 1, e: 1 } };
  assert.deepEqual(parseWatch(serializeWatch(tv), now), tv);
  const films: Watch = { ...film, prev: { st: "none" } };
  assert.deepEqual(parseWatch(serializeWatch(films), now), films);
  for (const bad of [{ st: "watched" }, { st: 3 }, "partial", null, []]) {
    const w = parseWatch(JSON.stringify({ ...tv, prev: bad }), now);
    assert.ok(w && !("prev" in w), JSON.stringify(bad));
  }
  // a place that is not a whole number >= 1 is ignored, the status is kept
  assert.deepEqual(parseWatch(JSON.stringify({ ...tv, prev: { st: "partial", s: 0, e: 2 } }), now)?.prev, { st: "partial" });
  assert.deepEqual(parseWatch(JSON.stringify({ ...tv, prev: { st: "partial", s: 2 } }), now)?.prev, { st: "partial" });
  // films carry no place
  assert.deepEqual(parseWatch(JSON.stringify({ ...film, prev: { st: "none", s: 1, e: 1 } }), now)?.prev, { st: "none" });
});
