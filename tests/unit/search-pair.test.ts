import test from "node:test";
import assert from "node:assert/strict";
import { splitPair, splitCandidates } from "../../src/lib/search-pair";

test("splits two names on the usual separators", () => {
  for (const s of ["tom hanks + meg ryan", "Tom Hanks and Meg Ryan", "tom hanks & meg ryan", "tom hanks, meg ryan", "tom hanks vs. meg ryan", "tom hanks with meg ryan", "tom hanks+meg ryan"]) {
    assert.deepEqual(splitPair(s)?.map((x) => x.toLowerCase()), ["tom hanks", "meg ryan"], s);
  }
});
test("not a pair", () => {
  for (const s of ["tom hanks", "a + b + c", "tom hanks and", "x and y", "brand new"]) assert.equal(splitPair(s), null, s);
});

test("cuts of a text without separator", () => {
  const c = splitCandidates("richard gere edward norton");
  assert.deepEqual(c[0], ["richard gere", "edward norton"]);
  assert.ok(splitCandidates("how i met your mother breaking bad").some(([a, b]) => a === "how i met your mother" && b === "breaking bad"));
  assert.deepEqual(splitCandidates("tom hanks"), []);
  assert.deepEqual(splitCandidates("tom hanks and meg ryan"), []);
});
