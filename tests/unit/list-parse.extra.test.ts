import test from "node:test";
import assert from "node:assert/strict";
import { parseText } from "../../src/lib/list-parse";
import { episodeNote } from "../../src/lib/upcoming";

const first = (text: string) => parseText(text, "watched")[0];

test("a 10/10 rating is read whole, not from its last digit", () => {
  const e = first("Inception 10/10");
  assert.equal(e.name, "Inception");
  assert.equal(e.rating, 5);
  assert.equal(first("Inception 9/10").rating, 5);
  assert.equal(first("Inception 3/5").rating, 3);
});

test("a trailing number that cannot be a release year stays in the title", () => {
  const e = first("Blade Runner 2049");
  assert.equal(e.name, "Blade Runner 2049");
  assert.equal(e.year, null);
  const d = first("Die Hard 1988");
  assert.equal(d.name, "Die Hard");
  assert.equal(d.year, 1988);
});

test("specials (season 0) are neither a premiere nor a new season", () => {
  assert.equal(episodeNote(0, 1), null);
  assert.equal(episodeNote(1, 1), "Premiere");
});
