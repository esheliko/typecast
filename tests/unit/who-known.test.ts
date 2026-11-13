import { test } from "node:test";
import assert from "node:assert/strict";
import { characterName, pickSeenIn, sortByRelease, seenInText, type KnownTitle } from "../../src/lib/who-known";

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
    ["movie:1", "Big Film", "2010", "Waiter", 0, 30000, -1],
    ["tv:2", "Small Show", "2015", "Sam", 40, 200, -1],
    ["tv:3", "Hit Show", "2012", "Walter White", 62, 15000, -1],
  ];
  const p = pickSeenIn(top, "tv:9", seen("movie:1", "tv:2", "tv:3"))!;
  assert.equal(p.key, "tv:3");
  assert.equal(seenInText(p), "Walter White in Hit Show");
});

test("only seen titles, never the current one", () => {
  const top: KnownTitle[] = [["tv:3", "Hit Show", "2012", "Walt", 62, 15000, -1], ["movie:4", "Film", "2001", "Ann", 0, 5000, -1]];
  assert.equal(pickSeenIn(top, "tv:3", seen("tv:3"))?.key ?? null, null);
  assert.equal(pickSeenIn(top, "tv:3", seen("tv:3", "movie:4"))!.key, "movie:4");
  assert.equal(pickSeenIn(top, "x", seen()), null);
});

test("a finished series beats one you only started; a rating tips a close call", () => {
  const top: KnownTitle[] = [["tv:1", "A", "2010", "Ann", 30, 5000, -1], ["tv:2", "B", "2010", "Bea", 30, 5000, -1]];
  const m = (k: string) => (k === "tv:1" ? { status: "partial", rich: false } : { status: "watched", rich: false });
  assert.equal(pickSeenIn(top, "x", m)!.key, "tv:2");
  const tie = (k: string) => ({ status: "watched", rich: k === "tv:1" });
  assert.equal(pickSeenIn(top, "x", tie)!.key, "tv:1");
});

test("no character falls back to Seen in", () => {
  const p = pickSeenIn([["movie:1", "Doc", "2019", "Self", 0, 900, -1]], "x", seen("movie:1"))!;
  assert.equal(seenInText(p), "Seen in Doc");
});

test("a bit part in a bigger film loses to a recurring series role", () => {
  const top: KnownTitle[] = [
    ["movie:1", "War Dogs", "2016", "Soldier", 0, 6000, 25],
    ["tv:2", "Shameless", "2011", "Emmett", 3, 5000, -1],
  ];
  assert.equal(pickSeenIn(top, "x", seen("movie:1", "tv:2"))!.key, "tv:2");
});

test("rankByRecognition: part and fame beat date; seen titles rise; the watched show leads", async () => {
  const { rankByRecognition } = await import("../../src/lib/who-known");
  const rows = [
    { key: "movie:new", date: "2024-01-01", year: "2024", role: "Waiter", eps: 0, votes: 50 },
    { key: "tv:hit", date: "2008-01-20", year: "2008", role: "Walter White", eps: 62, votes: 15000 },
    { key: "movie:old", date: "1999-05-01", year: "1999", role: "Ann", eps: 0, votes: 9000, order: 1 },
    { key: "tv:now", date: "2020-01-01", year: "2020", role: "Sam", eps: 3, votes: 0 },
  ];
  const keys = (r: typeof rows) => r.map((x) => x.key);
  assert.deepEqual(keys(rankByRecognition(rows, () => undefined)), ["tv:hit", "movie:old", "tv:now", "movie:new"]);
  assert.equal(rankByRecognition(rows, () => undefined, "tv:now")[0].key, "tv:now");
  const seenNew = rankByRecognition(rows, (k) => (k === "movie:old" ? { status: "watched", rich: false } : undefined));
  assert.equal(seenNew[0].key, "movie:old");
  assert.equal(rows[0].key, "movie:new", "input untouched");
});

test("sortByRelease puts the newest first and undated rows last", () => {
  const rows = [{ k: "a", d: "1976-01-01" }, { k: "b", d: "" }, { k: "c", d: "2012-08-01" }, { k: "d", d: "1976-01-01" }];
  assert.deepEqual(sortByRelease(rows, (r) => r.d).map((r) => r.k), ["c", "a", "d", "b"]);
});

test("a voice part is a weak answer: the seen face beats the same character as a voice", () => {
  const top: KnownTitle[] = [
    ["tv:1", "What If...?", "2021", "Karpov (voice)", 2, 4000, -1],
    ["movie:2", "Civil War", "2024", "Karpov", 0, 3000, -1],
  ];
  assert.equal(pickSeenIn(top, "x", seen("tv:1", "movie:2"))!.key, "movie:2");
  assert.equal(pickSeenIn(top, "x", seen("tv:1"))!.key, "tv:1"); // still offered when it is all you have seen
  assert.equal(seenInText(pickSeenIn(top, "x", seen("tv:1"))!), "Karpov in What If...?");
});
