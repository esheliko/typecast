import test from "node:test";
import assert from "node:assert/strict";
import { pickCut, splitPair, splitCandidates } from "../../src/lib/search-pair";

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

// pickPair: the sides of a guessed cut. Shapes copied from live TMDB answers.
import { pickPair } from "../../src/lib/search-pair";
import type { SearchHit } from "../../src/lib/types";
let id = 100;
const T = (title: string, pop: number, votes: number): SearchHit => ({ kind: "title", key: `movie:${++id}`, type: "movie", id, title, year: "2000", poster: null, rating: 7, pop, votes });
const P = (name: string, pop: number): SearchHit => ({ kind: "person", id: ++id, name, photo: null, dept: "Acting", knownFor: [], knownKeys: [], pop });

test("pickPair: a little-known film next to a famous one resolves as two titles", () => {
  const got = pickPair("rumble fish", "matrix", [T("Rumble Fish", 3, 1200), T("Rumble", 20, 900)], [T("The Matrix", 60, 25000)]);
  assert.deepEqual(got?.map((h) => (h.kind === "title" ? h.title : "")), ["Rumble Fish", "The Matrix"]);
});

test("pickPair: a name that is a person AND a film ('erin brockovich') still pairs as two titles", () => {
  const got = pickPair("rumble fish", "erin brockovich", [T("Rumble Fish", 3, 1200)], [P("Erin Brockovich", 8), T("Erin Brockovich", 14, 6000)]);
  assert.deepEqual(got?.map((h) => h.kind), ["title", "title"]);
});

test("pickPair: two people stay two people; a person next to a title is never paired", () => {
  const two = pickPair("richard gere", "edward norton", [P("Richard Gere", 15)], [P("Edward Norton", 12)]);
  assert.deepEqual(two?.map((h) => h.kind), ["person", "person"]);
  assert.equal(pickPair("rumble fish", "tom hanks", [T("Rumble Fish", 3, 1200)], [P("Tom Hanks", 40)]), null);
  assert.equal(pickPair("pulp fiction", "kill bill", [T("Pulp Fiction", 40, 28000)], [T("Kill Bill: Vol. 1", 30, 17000)]), null);
});


test("pickCut takes the first cut (in the order given) whose sides both resolve, and skips sides that never arrived", () => {
  const title = (t: string, id: number): SearchHit => ({ kind: "title", key: `movie:${id}`, type: "movie", id, title: t, year: "2000", poster: null, rating: 7, votes: 5000, pop: 50 } as unknown as SearchHit);
  const hits: Record<string, SearchHit[]> = { "rumble fish": [title("Rumble Fish", 1)], "erin brockovich": [title("Erin Brockovich", 2)], "rumble": [title("Rumble", 3)] };
  const cuts: [string, string][] = [["rumble fish", "erin brockovich"], ["rumble", "fish erin brockovich"]];
  const got = pickCut(cuts, (s) => hits[s]);
  assert.deepEqual(got?.map((h) => (h.kind === "title" ? h.title : "")), ["Rumble Fish", "Erin Brockovich"]);
  assert.equal(pickCut([["a b", "c d"]], () => undefined), null);
});
