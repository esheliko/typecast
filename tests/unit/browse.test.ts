import test from "node:test";
import assert from "node:assert/strict";
import { parseBrowse, toParams, isActive, interleave, convertGenres, genresFor, mergeGenres } from "../../src/lib/browse";

test("an empty query is the default and not active", () => {
  const q = parseBrowse({});
  assert.deepEqual(q, { type: "all", genres: [], from: "", to: "", people: [], companies: [], keywords: [], country: "", lang: "", sort: "popular", minRating: 0, mine: false });
  assert.equal(isActive(q), false);
  assert.equal(toParams(q).size, 0);
});

test("parseBrowse rejects junk and keeps good values", () => {
  const q = parseBrowse({ type: "bogus", sort: "nope", rating: "9", from: "20x", genre: ["28", "x", "-1", "28", "35"], mine: "0" });
  assert.equal(q.type, "all"); assert.equal(q.sort, "popular"); assert.equal(q.minRating, 0); assert.equal(q.from, "");
  assert.deepEqual(q.genres, [28, 35]); assert.equal(q.mine, false);
  const g = parseBrowse({ type: "tv", sort: "newest", rating: "7", mine: "1" });
  assert.equal(g.type, "tv"); assert.equal(g.sort, "newest"); assert.equal(g.minRating, 7); assert.equal(g.mine, true);
});

test("swapped years are put in order; genres and tags are capped", () => {
  const q = parseBrowse({ from: "2020", to: "2010", genre: Array.from({ length: 10 }, (_, i) => String(i + 1)), person: Array.from({ length: 9 }, (_, i) => `${i + 1}:P${i}`) });
  assert.equal(q.from, "2010"); assert.equal(q.to, "2020");
  assert.equal(q.genres.length, 6); assert.equal(q.people.length, 6);
});

test("tags need an id:name form and are de-duplicated", () => {
  const q = parseBrowse({ person: ["287:Brad Pitt", "287:Again", "abc:x", "noid", "0:zero", "5:A:B"] });
  assert.deepEqual(q.people, [{ id: 287, name: "Brad Pitt" }, { id: 5, name: "A:B" }]);
});

test("toParams round-trips through parseBrowse, and reads URLSearchParams", () => {
  const q = parseBrowse({ type: "movie", genre: ["28", "35"], from: "1990", to: "1999", person: "287:Brad Pitt", company: "1:Acme", keyword: "9:heist", sort: "rating", rating: "8", mine: "1", country: "il", lang: "he" });
  assert.equal(q.country, "IL"); assert.equal(q.lang, "he");
  assert.equal(isActive(q), true);
  assert.deepEqual(parseBrowse(toParams(q)), q);
  assert.deepEqual(parseBrowse(new URLSearchParams("genre=28&genre=35&type=movie")).genres, [28, 35]);
});

test("interleave alternates and drops repeats", () => {
  const k = (...x: string[]) => x.map((key) => ({ key }));
  assert.deepEqual(interleave(k("a", "b", "c"), k("x", "b")).map((i) => i.key), ["a", "x", "b", "c"]);
  assert.deepEqual(interleave(k(), k("y")).map((i) => i.key), ["y"]);
  assert.deepEqual(interleave(k(), k()), []);
});

test("convertGenres maps between films, series and both", () => {
  assert.deepEqual(convertGenres([28, 35], "movie", "movie"), [28, 35]);
  assert.deepEqual(convertGenres([28, 35], "movie", "tv"), [10759, 35]); // Action -> Action & Adventure
  assert.deepEqual(convertGenres([10759, 35], "tv", "movie"), [28, 35]);
  assert.deepEqual(convertGenres([27, 35], "movie", "tv"), [35]); // Horror has no series genre
  assert.deepEqual(convertGenres([10764, 35], "tv", "movie"), [35]); // Reality has no film genre
  assert.deepEqual(convertGenres([28, 12], "movie", "tv"), [10759]); // two film genres, one series genre
  assert.deepEqual(convertGenres([10759], "tv", "all"), [28]);
});

test("genresFor returns null when a type has no such genre", () => {
  assert.equal(genresFor("movie", [10764]), null);
  assert.equal(genresFor("tv", [27]), null);
  assert.deepEqual(genresFor("tv", [28, 35]), [10759, 35]);
  assert.deepEqual(genresFor("movie", [28, 35]), [28, 35]);
});

test("mergeGenres folds series genres into film ones and sorts A to Z", () => {
  const film = [{ id: 28, name: "Action" }, { id: 35, name: "Comedy" }];
  const tv = [{ id: 10759, name: "Action & Adventure" }, { id: 10764, name: "Reality" }, { id: 35, name: "Comedy" }];
  assert.deepEqual(mergeGenres(film, tv).map((g) => g.name), ["Action", "Comedy", "Reality"]);
});

test("country and language accept only known codes", () => {
  const q = parseBrowse({ country: "XX", lang: "zz" });
  assert.equal(q.country, ""); assert.equal(q.lang, "");
  assert.equal(parseBrowse({ country: "IL" }).country, "IL");
});
