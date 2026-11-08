import test from "node:test";
import assert from "node:assert/strict";
import { layoutSearch, nameTier, youKnowFrom, type LibLookup } from "../../src/lib/search-intent";
import type { SearchHit } from "../../src/lib/types";

// Shapes and numbers copied from live TMDB answers.
let n = 0;
const T = (title: string, pop: number, votes: number, type: "movie" | "tv" = "movie", year = "2000"): SearchHit =>
  ({ kind: "title", key: `${type}:${++n}`, type, id: n, title, year, poster: null, rating: 7, pop, votes });
const P = (name: string, pop: number, knownFor: string[] = [], dept = "Acting"): SearchHit =>
  ({ kind: "person", id: ++n, name, photo: null, dept, knownFor, knownKeys: knownFor.map((_, i) => `movie:${n * 10 + i}`), pop });
const names = (hs: SearchHit[]) => hs.map((h) => (h.kind === "person" ? h.name : h.title));

test("nameTier ignores a leading article and ranks exact, prefix, word, partial", () => {
  assert.equal(nameTier("matrix", "The Matrix"), 4);
  assert.equal(nameTier("the matrix", "Matrix"), 4);
  assert.equal(nameTier("dune", "Dune: Part Two"), 3);
  assert.equal(nameTier("nolan", "Christopher Nolan"), 2);
  assert.equal(nameTier("la la", "La Casa de los Famosos"), 1);
  assert.equal(nameTier("matrix", "Casablanca"), 0);
});

test("a title query drops unknown people and leads with the big title", () => {
  const l = layoutSearch("matrix", [P("Matrix Naovaratpong", 0.2), P("Matrix Katindig", 0.1), T("Matrix", 2.8, 4, "tv"), T("The Matrix", 38.3, 29193), T("The Matrix Reloaded", 18.1, 12520)]);
  assert.equal(l.intent, "title");
  assert.deepEqual(names([l.top!]), ["The Matrix"]);
  assert.deepEqual(l.people, []);
  assert.ok(names(l.titles).includes("The Matrix Reloaded"));
  assert.ok(!names(l.titles).includes("Matrix"), "a 4-vote title folds");
  assert.ok(names(l.folded).includes("Matrix"));
});

test("a person query leads with the famous person, not the exact-name nobodies", () => {
  const l = layoutSearch("nolan", [P("Nolan", 0.1), P("Nolan", 0), P("Nolan North", 2), P("Christopher Nolan", 8.6, [], "Directing"), P("Jonathan Nolan", 1.6), T("Nolan's 14", 0.5, 0)]);
  assert.equal(l.intent, "person");
  assert.deepEqual(names([l.top!]), ["Christopher Nolan"]);
  assert.deepEqual(names(l.people), ["Nolan North", "Jonathan Nolan"]);
  assert.deepEqual(l.titles, []);
});

test("a famous person beats a modest film of the same name", () => {
  const l = layoutSearch("keanu", [T("Keanu", 2.7, 1191), P("Keanu Reeves", 8.9), P("Keanu", 0), P("Keanu Karim", 0.8)]);
  assert.equal(l.intent, "person");
  assert.deepEqual(names([l.top!]), ["Keanu Reeves"]);
  assert.deepEqual(names(l.titles), ["Keanu"]);
  assert.deepEqual(l.people, []);
});

test("a big title and a famous person both match: mixed, higher one on top, other under it", () => {
  const l = layoutSearch("hero", [T("Hero", 30, 9000), P("Hero Fiennes", 6)]);
  assert.equal(l.intent, "mixed");
  assert.ok(l.top && l.also);
  assert.notEqual(l.top!.kind, l.also!.kind);
});

test("an unfinished word still leads with the big title that starts with it", () => {
  const l = layoutSearch("breaking", [T("Breaking Bad", 149, 19062, "tv"), T("Breaking", 1.6, 246), T("Breaking Ground", 0, 0), P("Breaking Ground", 0)]);
  assert.equal(l.intent, "title");
  assert.deepEqual(names([l.top!]), ["Breaking Bad"]);
});

test("nothing strong: unclear, no top result, notable people kept", () => {
  const l = layoutSearch("la la", [T("La Casa de los Famosos México", 488, 84, "tv"), P("La La Anthony", 1.8), P("Alana de la Garza", 3)]);
  assert.equal(l.intent, "unclear");
  assert.equal(l.top, null);
  assert.deepEqual(l.people, [], "people who only loosely match are left out");
});

test("La La Land beats the loose matches once it is in the results", () => {
  const l = layoutSearch("la la", [T("La Casa de los Famosos México", 488, 84, "tv"), T("La Bola Negra", 143, 189), T("La La Land", 30, 17000)]);
  assert.deepEqual(names([l.top!]), ["La La Land"]);
});

test("a full obscure name still finds the person; unknown people show when nothing else exists", () => {
  assert.equal(layoutSearch("jane q smith", [P("Jane Q Smith", 0.3)]).top?.kind, "person");
  const l = layoutSearch("zzqx", [P("Zzqx Person", 0.1)]);
  assert.equal(l.intent, "unclear");
  assert.deepEqual(names(l.people), ["Zzqx Person"]);
});

test("a title you marked that matches as well becomes the top result", () => {
  const us = T("The Office", 1762, 5681, "tv", "2005"), uk = T("The Office", 10.4, 1016, "tv", "2001");
  const lib: LibLookup = (k) => (k === (uk as { key: string }).key ? { status: "watched", rich: false } : undefined);
  assert.equal((layoutSearch("the office", [us, uk]).top as { key: string }).key, (us as { key: string }).key);
  assert.equal((layoutSearch("the office", [us, uk], lib).top as { key: string }).key, (uk as { key: string }).key);
});

test("marked titles lead the grid only among real name matches", () => {
  const a = T("Dune", 39, 15908), b = T("Dune: Part Two", 44, 8922), c = T("Dune: Prophecy", 23, 679, "tv"), d = T("Frank Herbert's Dune", 6.4, 392, "tv");
  const lib: LibLookup = (k) => (k === (c as { key: string }).key ? { status: "watchlist", rich: false } : k === (d as { key: string }).key ? { status: "watched", rich: true } : undefined);
  const l = layoutSearch("dune", [a, b, c, d], lib);
  assert.deepEqual(names([l.top!]), ["Dune"], "a marked sequel does not beat the better name match");
  assert.deepEqual(names(l.titles), ["Frank Herbert's Dune", "Dune: Prophecy", "Dune: Part Two"], "rated first, then marked, then the rest");
});

test("youKnowFrom lists seen known-for titles, not watchlist ones", () => {
  const p = P("Al Pacino", 6.4, ["The Godfather Part II", "Scarface", "The Godfather"]) as Extract<SearchHit, { kind: "person" }>;
  const lib: LibLookup = (k) => (k === p.knownKeys![0] ? { status: "watched" } : k === p.knownKeys![1] ? { status: "watchlist" } : undefined);
  assert.deepEqual(youKnowFrom(p, lib), ["The Godfather Part II"]);
});
