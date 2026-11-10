import { test } from "node:test";
import assert from "node:assert/strict";
import { characterName, pickSeenIn, seenInText, type KnownTitle } from "../../src/lib/who-known";

const seen = (...keys: string[]) => (k: string) => (keys.includes(k) ? { status: "watched", rich: false } : undefined);

test("character names", () => {
  assert.equal(characterName("Walter White"), "Walter White");
  assert.equal(characterName("Self"), "");
  assert.equal(characterName("Himself - Host"), "");
  assert.equal(characterName("Waiter (uncredited)"), "Waiter");
  assert.equal(characterName("Bruce Wayne / Batman"), "Bruce Wayne");
});

test("a lead in a hit beats a cameo in a hit and a lead in an obscure title", () => {
  const top: KnownTitle[] = [
    ["movie:1", "Big Film", "2010", "Waiter", 0, 30000],
    ["tv:2", "Small Show", "2015", "Sam", 40, 200],
    ["tv:3", "Hit Show", "2012", "Walter White", 62, 15000],
  ];
  const p = pickSeenIn(top, "tv:9", seen("movie:1", "tv:2", "tv:3"))!;
  assert.equal(p.key, "tv:3");
  assert.equal(seenInText(p), "Walter White in Hit Show");
});

test("only seen titles, never the current one", () => {
  const top: KnownTitle[] = [["tv:3", "Hit Show", "2012", "Walt", 62, 15000], ["movie:4", "Film", "2001", "Ann", 0, 5000]];
  assert.equal(pickSeenIn(top, "tv:3", seen("tv:3"))?.key ?? null, null);
  assert.equal(pickSeenIn(top, "tv:3", seen("tv:3", "movie:4"))!.key, "movie:4");
  assert.equal(pickSeenIn(top, "x", seen()), null);
});

test("a finished series beats one you only started; a rating tips a close call", () => {
  const top: KnownTitle[] = [["tv:1", "A", "2010", "Ann", 30, 5000], ["tv:2", "B", "2010", "Bea", 30, 5000]];
  const m = (k: string) => (k === "tv:1" ? { status: "partial", rich: false } : { status: "watched", rich: false });
  assert.equal(pickSeenIn(top, "x", m)!.key, "tv:2");
  const tie = (k: string) => ({ status: "watched", rich: k === "tv:1" });
  assert.equal(pickSeenIn(top, "x", tie)!.key, "tv:1");
});

test("no character falls back to Seen in", () => {
  const p = pickSeenIn([["movie:1", "Doc", "2019", "Self", 0, 900]], "x", seen("movie:1"))!;
  assert.equal(seenInText(p), "Seen in Doc");
});
