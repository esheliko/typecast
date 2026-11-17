import test from "node:test";
import assert from "node:assert/strict";
import { parseOmdb } from "../../src/lib/imdb-rating";

test("parses rating and votes", () => assert.deepEqual(parseOmdb({ Response: "True", imdbRating: "8.1", imdbVotes: "1,234,567" }), { rating: 8.1, votes: 1234567 }));
test("N/A and errors are unknown", () => {
  assert.equal(parseOmdb({ Response: "True", imdbRating: "N/A" }), null);
  assert.equal(parseOmdb({ Response: "False", Error: "x" }), null);
  assert.equal(parseOmdb(null), null);
});

test("parseOmdbSeason maps episode numbers to scores and skips N/A", async () => {
  const { parseOmdbSeason } = await import("../../src/lib/imdb-rating");
  assert.deepEqual(parseOmdbSeason({ Response: "True", Episodes: [{ Episode: "1", imdbRating: "8.4" }, { Episode: "2", imdbRating: "N/A" }, { Episode: "3", imdbRating: "9.1" }] }), { 1: 8.4, 3: 9.1 });
  assert.deepEqual(parseOmdbSeason({ Response: "False" }), {});
  assert.deepEqual(parseOmdbSeason(null), {});
});

test("omdbFailed tells a failed call from a title with no score", async () => {
  const { omdbFailed } = await import("../../src/lib/imdb-rating");
  assert.equal(omdbFailed({ Response: "False", Error: "Request limit reached!" }), true);
  assert.equal(omdbFailed({ Response: "False", Error: "Invalid API key!" }), true);
  assert.equal(omdbFailed(null), true);
  assert.equal(omdbFailed({ Response: "False", Error: "Incorrect IMDb ID." }), false);
  assert.equal(omdbFailed({ Response: "True", imdbRating: "N/A" }), false);
});

test("isFresh keeps a score 14 days and a 'no score' 3 days", async () => {
  const { isFresh } = await import("../../src/lib/imdb-rating");
  const now = Date.now(), d = 86400000;
  assert.equal(isFresh({ rating: 7.5, fetchedAt: now - 13 * d }, now), true);
  assert.equal(isFresh({ rating: 7.5, fetchedAt: now - 15 * d }, now), false);
  assert.equal(isFresh({ rating: null, fetchedAt: now - 2 * d }, now), true);
  assert.equal(isFresh({ rating: null, fetchedAt: now - 4 * d }, now), false);
});

test("ttlDays scales with the title's age and isFresh uses it", async () => {
  const { ttlDays, isFresh, parseOmdbReleased } = await import("../../src/lib/imdb-rating");
  const now = Date.now(), d = 86400000;
  assert.equal(ttlDays(now - 5 * d, true, now), 2);          // brand new: 2-day floor
  assert.equal(Math.round(ttlDays(now - 365 * d, true, now)), 37); // a year old
  assert.equal(ttlDays(now - 9000 * d, true, now), 180);     // classic: capped
  assert.equal(ttlDays(null, true, now), 14);                // unknown: old rule
  assert.equal(ttlDays(now - 9000 * d, false, now), 30);     // no score on an old title: capped at 30
  assert.equal(ttlDays(now - 5 * d, false, now), 3);
  assert.equal(isFresh({ rating: 8, fetchedAt: now - 100 * d, released: now - 9000 * d }, now), true);
  assert.equal(isFresh({ rating: 8, fetchedAt: now - 3 * d, released: now - 5 * d }, now), false);
  assert.equal(parseOmdbReleased({ Released: "15 Mar 2019" }), Date.parse("15 Mar 2019"));
  assert.equal(parseOmdbReleased({ Released: "N/A", Year: "2008–2013" }), Date.UTC(2008, 0, 1));
  assert.equal(parseOmdbReleased({ Released: "N/A", Year: "N/A" }), null);
});

test("omdbKeys lists the main key then the spare, skipping blanks and duplicates", async () => {
  const { omdbKeys } = await import("../../src/lib/imdb-rating");
  assert.deepEqual(omdbKeys({ OMDB_API_KEY: "a", OMDB_API_KEY_2: "b" }), ["a", "b"]);
  assert.deepEqual(omdbKeys({ OMDB_API_KEY: "a", OMDB_API_KEY_2: " a " }), ["a"]);
  assert.deepEqual(omdbKeys({ OMDB_API_KEY_2: "b" }), ["b"]);
  assert.deepEqual(omdbKeys({}), []);
});
