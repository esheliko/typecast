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

test("omdbKeys lists the main key then the spare, skipping blanks and duplicates", async () => {
  const { omdbKeys } = await import("../../src/lib/imdb-rating");
  assert.deepEqual(omdbKeys({ OMDB_API_KEY: "a", OMDB_API_KEY_2: "b" }), ["a", "b"]);
  assert.deepEqual(omdbKeys({ OMDB_API_KEY: "a", OMDB_API_KEY_2: " a " }), ["a"]);
  assert.deepEqual(omdbKeys({ OMDB_API_KEY_2: "b" }), ["b"]);
  assert.deepEqual(omdbKeys({}), []);
});
