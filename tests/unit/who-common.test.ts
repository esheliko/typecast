import { test } from "node:test";
import assert from "node:assert/strict";
import { commonResults, intersectCast, pairLabels, peopleHere, sharedTitles, strongTitleMatch, titlesForQuery, titlesWithPeople, type FoundTitle } from "../../src/lib/who-common";
import type { PCredit } from "../../src/lib/who-types";

const cast = [{ id: 1, role: "Nell" }, { id: 2, role: "Penny" }, { id: 1, role: "dup" }, { id: 3, role: "Raj" }];

test("titles in common: the cast narrowed to the roster, each person once", () => {
  assert.deepEqual(intersectCast(new Set([1, 3, 9]), cast), [{ id: 1, role: "Nell" }, { id: 3, role: "Raj" }]);
  assert.deepEqual(intersectCast(new Set(), cast), []);
});

test("titles in common: only titles with someone here, with the count in words", () => {
  const res = commonResults([
    { key: "tv:1418", type: "tv", title: "The Big Bang Theory", year: "2007", poster: null, pop: 90, cast },
    { key: "movie:5", type: "movie", title: "Other", year: "2000", poster: null, pop: 3, cast: [{ id: 99, role: "x" }] },
  ], new Set([1]));
  assert.equal(res.length, 1);
  assert.equal(res[0].title, "The Big Bang Theory");
  assert.equal(res[0].people.length, 1);
  assert.equal(`${res[0].title}: ${peopleHere(res[0].people.length)}`, "The Big Bang Theory: 1 person here");
  assert.equal(peopleHere(3), "3 people here");
  assert.ok(!("cast" in res[0]), "the whole cast is not sent on");
});

const C = (key: string, date: string, extra = false, role = ""): PCredit => ({ key, type: key.startsWith("tv") ? "tv" : "movie", id: Number(key.split(":")[1]), title: key, year: date.slice(0, 4), poster: null, role, date, eps: 1, cids: [], extra, votes: 0 });

test("shared titles: newest first, extras and the excluded title dropped", () => {
  const a = [C("tv:1", "2019-01-01"), C("movie:2", "2008-01-01"), C("tv:3", "2015-01-01", true), C("movie:4", "2001-01-01"), C("movie:5", "2020-01-01")];
  const b = [C("movie:2", "2008-01-01"), C("tv:1", "2017-01-01"), C("tv:3", "2015-01-01", true), C("movie:5", "2020-01-01")];
  assert.deepEqual(sharedTitles(a, b, { exclude: "movie:5" }).map((s) => s.key), ["tv:1", "movie:2"]);
  assert.deepEqual(sharedTitles(a, b, { extras: true }).map((s) => s.key), ["movie:5", "tv:1", "tv:3", "movie:2"]);
  assert.equal(sharedTitles(a, b).find((s) => s.key === "tv:1")!.b.date, "2017-01-01", "each side keeps its own dates");
});

const T = (title: string, pop: number, ids = [1]): FoundTitle => ({ key: `x:${title}`, type: "movie", title, year: "1994", poster: null, pop, people: ids.map((id) => ({ id, role: "" })) });

test("finder: a short query does not name an obscure namesake, a long popular title does", () => {
  assert.equal(strongTitleMatch("Nell", "Nell", 6), false, "not popular");
  assert.equal(strongTitleMatch("Nell", "Nell", 60), true);
  assert.equal(strongTitleMatch("big", "The Big Bang Theory", 99), false, "under 4 letters");
  assert.equal(strongTitleMatch("bang", "The Big Bang Theory", 99), true, "a whole word");
  assert.equal(strongTitleMatch("the big ba", "The Big Bang Theory", 99), true, "start of the title");
  assert.equal(strongTitleMatch("ang", "The Big Bang Theory", 99), false, "not a whole word");
  assert.equal(strongTitleMatch("rook", "The Rookie", 99), false, "a part of a word is not a whole word");
});

test("finder: with cast matches only a strong title stays; with none every title is the answer", () => {
  const nell = T("Nell", 6), bbt = T("The Big Bang Theory", 120);
  assert.deepEqual(titlesForQuery("Nell", [nell], true), [], "Nell the film does not show above or beside Sara Rue");
  assert.deepEqual(titlesForQuery("big bang", [bbt, nell], true).map((t) => t.title), ["The Big Bang Theory"]);
  assert.deepEqual(titlesForQuery("Nell", [nell], false).map((t) => t.title), ["Nell"]);
});

test("finder: the Women/Men chip applies to the people inside titles in common", () => {
  const ts = [T("A", 50, [1, 2]), T("B", 50, [2])];
  const out = titlesWithPeople(ts, (id) => id === 1);
  assert.deepEqual(out.map((t) => [t.title, t.people.map((p) => p.id)]), [["A", [1]]]);
});

test("with this cast: her/him when the genders differ, they next to a known one, else first names", () => {
  assert.deepEqual(pairLabels({ name: "Sara Rue", g: 1 }, { name: "Jim Parsons", g: 2 }), ["her", "him"]);
  assert.deepEqual(pairLabels({ name: "Sara Rue", g: 1 }, { name: "Alex Doe", g: 0 }), ["her", "they"]);
  assert.deepEqual(pairLabels({ name: "Sara Rue", g: 1 }, { name: "Kaley Cuoco", g: 1 }), ["Sara", "Kaley"]);
  assert.deepEqual(pairLabels({ name: "A B", g: 0 }, { name: "C D", g: 0 }), ["A", "C"]);
});
