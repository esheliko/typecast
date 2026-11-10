import { test } from "node:test";
import assert from "node:assert/strict";
import { commonResults, intersectCast, peopleHere, sharedTitles } from "../../src/lib/who-common";
import type { PCredit } from "../../src/lib/who-types";

const cast = [{ id: 1, role: "Nell" }, { id: 2, role: "Penny" }, { id: 1, role: "dup" }, { id: 3, role: "Raj" }];

test("titles in common: the cast narrowed to the roster, each person once", () => {
  assert.deepEqual(intersectCast(new Set([1, 3, 9]), cast), [{ id: 1, role: "Nell" }, { id: 3, role: "Raj" }]);
  assert.deepEqual(intersectCast(new Set(), cast), []);
});

test("titles in common: only titles with someone here, with the count in words", () => {
  const res = commonResults([
    { key: "tv:1418", type: "tv", title: "The Big Bang Theory", year: "2007", poster: null, cast },
    { key: "movie:5", type: "movie", title: "Other", year: "2000", poster: null, cast: [{ id: 99, role: "x" }] },
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
