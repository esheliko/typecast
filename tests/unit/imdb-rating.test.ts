import test from "node:test";
import assert from "node:assert/strict";
import { parseOmdb } from "../../src/lib/imdb-rating";

test("parses rating and votes", () => assert.deepEqual(parseOmdb({ Response: "True", imdbRating: "8.1", imdbVotes: "1,234,567" }), { rating: 8.1, votes: 1234567 }));
test("N/A and errors are unknown", () => {
  assert.equal(parseOmdb({ Response: "True", imdbRating: "N/A" }), null);
  assert.equal(parseOmdb({ Response: "False", Error: "x" }), null);
  assert.equal(parseOmdb(null), null);
});
