import { test } from "node:test";
import assert from "node:assert/strict";
import { elapsedMin, parseWatch, quickQuestions, serializeWatch, spoilerPoint, whereLabel, WATCH_MAX_MS, type Watch } from "../../src/lib/watching";

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
  assert.match(spoilerPoint(film, now), /42 minutes into the film of about 170/);
  assert.match(spoilerPoint({ ...film, type: "tv", s: 2, e: 5 }, now), /season 2, episode 5/);
});

test("quick questions fit the kind of title", () => {
  assert.ok(quickQuestions("tv").some((q) => /episode/.test(q)));
  assert.ok(quickQuestions("movie").some((q) => /post-credits/.test(q)));
});
