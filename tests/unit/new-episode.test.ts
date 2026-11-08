import { test } from "node:test";
import assert from "node:assert/strict";
import { newEpDetail, newEpisodeSince, newEpLabel, progressPassed, shortDate } from "../../src/lib/new-episode";
import { packMark, unpackMarks } from "../../src/lib/marks";

const day = (s: string) => Date.parse(`${s}T12:00:00Z`);
const facts = (last: string, s: number, e: number, seasons: [number, string | null][]) => ({ last: { s, e, date: last }, seasons: seasons.map(([n, air]) => ({ n, air })) });

test("nothing aired since the day it was watched: not new", () => {
  assert.equal(newEpisodeSince(day("2024-05-10"), facts("2024-05-10", 2, 8, [[1, "2023-01-01"], [2, "2024-03-01"]])), null);
  assert.equal(newEpisodeSince(day("2024-05-10"), facts("2023-01-01", 1, 8, [[1, "2023-01-01"]])), null);
  assert.equal(newEpisodeSince(day("2024-05-10"), { last: null, seasons: [] }), null);
  assert.equal(newEpisodeSince(day("2024-05-10"), null), null);
});

test("an episode in the same season is a new episode", () => {
  const n = newEpisodeSince(day("2024-05-10"), facts("2024-06-01", 2, 9, [[1, "2023-01-01"], [2, "2024-03-01"]]));
  assert.deepEqual(n, { at: "2024-06-01", s: 2, e: 9, season: false });
  assert.equal(newEpLabel(n!), "New episode");
});

test("a season that began after it was watched is a new season, even once later episodes aired", () => {
  const n = newEpisodeSince(day("2024-05-10"), facts("2024-07-20", 3, 4, [[0, "2024-06-01"], [1, "2023-01-01"], [2, "2024-03-01"], [3, "2024-07-01"]]));
  assert.deepEqual(n, { at: "2024-07-20", s: 3, e: 4, season: true });
  assert.equal(newEpLabel(n!), "New season");
});

test("a special (season 0) alone does not make a new season", () => {
  const n = newEpisodeSince(day("2024-05-10"), facts("2024-06-01", 0, 1, [[0, "2024-06-01"], [1, "2023-01-01"]]));
  assert.equal(n?.season, false);
});

test("labels and dates", () => {
  assert.equal(shortDate("2026-11-12", day("2026-11-20")), "12 Nov");
  assert.equal(shortDate("2025-01-05", day("2026-11-20")), "5 Jan 2025");
  assert.equal(newEpDetail({ at: "2026-11-12", s: 3, e: 1, season: true }, day("2026-11-20")), "S3 E1 aired 12 Nov");
});

test("progress at or past the new episode settles it", () => {
  const n = { s: 3, e: 2 };
  assert.equal(progressPassed(null, n), false);
  assert.equal(progressPassed({ s: 3, e: 1 }, n), false);
  assert.equal(progressPassed({ s: 2, e: 20 }, n), false);
  assert.equal(progressPassed({ s: 3, e: 2 }, n), true);
  assert.equal(progressPassed({ s: 4, e: 1 }, n), true);
});

test("marks carry the new-episode flag through packing", () => {
  const m = [
    { status: "watching" as const, priority: "someday" as const, rich: false, fresh: "episode" as const },
    { status: "watching" as const, priority: "someday" as const, rich: true, fresh: "season" as const },
    { status: "watched" as const, priority: "someday" as const, rich: false },
  ];
  const back = unpackMarks(Object.fromEntries(m.map((x, i) => [`tv:${i}`, packMark(x)])));
  assert.deepEqual(m.map((_, i) => back[`tv:${i}`]), m);
});
