import test from "node:test";
import assert from "node:assert/strict";
import { airsOn, airsText, clipUpto, nextOut, placeCard, pct, rowNext, subLine, totalEpisodes, upNextPlace, watchedCount } from "../../src/lib/place-strip";

const SEAS = [{ n: 1, eps: 10 }, { n: 2, eps: 12 }, { n: 3, eps: 14 }];

test("totals and counts: specials are not counted", () => {
  assert.equal(totalEpisodes([{ n: 0, eps: 3 }, ...SEAS]), 36);
  assert.equal(totalEpisodes([]), null);
  assert.equal(watchedCount({ s: 2, e: 3 }, SEAS), 13);
  assert.equal(watchedCount(null, SEAS), 0);
});

test("upNextPlace: the episode after the progress, rolling over a season end, null past the last episode", () => {
  assert.deepEqual(upNextPlace({ s: 3, e: 6 }, SEAS), { s: 3, e: 7 });
  assert.deepEqual(upNextPlace({ s: 1, e: 10 }, SEAS), { s: 2, e: 1 });
  assert.deepEqual(upNextPlace(null, SEAS), { s: 1, e: 1 });
  assert.equal(upNextPlace({ s: 3, e: 14 }, SEAS), null);
  assert.deepEqual(upNextPlace({ s: 3, e: 6 }, []), { s: 3, e: 7 }); // sizes unknown: just the next number
});

test("placeCard: next (out), unaired (hides the button), done (ended or waiting)", () => {
  const base = { seasons: SEAS, lastEp: { s: 3, e: 9 } };
  const a = placeCard({ ...base, progress: { s: 3, e: 6 } });
  assert.deepEqual(a, { kind: "next", place: { s: 3, e: 7 }, watched: 32 - 4 + 0, total: 36 });
  const b = placeCard({ ...base, progress: { s: 3, e: 9 }, next: { s: 3, e: 10, air: "2026-11-21" } });
  assert.equal(b.kind, "unaired");
  assert.equal(b.kind === "unaired" && b.air, "2026-11-21");
  const c = placeCard({ ...base, progress: { s: 3, e: 14 }, status: "Ended" });
  assert.equal(c.kind === "done" && c.ended, true);
  const d = placeCard({ ...base, progress: { s: 3, e: 14 }, status: "Returning Series", next: { s: 4, e: 1, air: "2027-01-01" } });
  assert.equal(d.kind === "done" && !d.ended && d.air, "2027-01-01");
  assert.equal(placeCard({ seasons: SEAS, progress: { s: 1, e: 2 } }).kind, "next"); // no lastEp known: counts as out
});

test("nextOut needs sizes and the newest aired episode", () => {
  assert.deepEqual(nextOut({ s: 2, e: 3 }, SEAS, { s: 2, e: 13 }), { s: 2, e: 4 });
  assert.equal(nextOut({ s: 2, e: 3 }, SEAS, { s: 2, e: 3 }), null);
  assert.equal(nextOut({ s: 2, e: 3 }, undefined, { s: 2, e: 13 }), null);
  assert.equal(nextOut(null, SEAS, { s: 2, e: 13 }), null);
});

test("labels", () => {
  assert.equal(airsOn("2026-10-21"), "Wed 21 Oct");
  assert.equal(airsText("2026-11-21", "2026-11-13"), "airs Sat 21 Nov");
  assert.equal(airsText("2026-11-14", "2026-11-13"), "airs tomorrow");
  assert.equal(airsText("2026-11-01", "2026-11-13"), "");
  assert.equal(subLine(47, 22, 36), "47 min · 22 of 36 watched");
  assert.equal(subLine(null, 0, null), "");
  assert.equal(pct(22, 36), 61);
  assert.equal(pct(5, null), 0);
});

test("rowNext: one step, rolling over only when the season size is known", () => {
  assert.deepEqual(rowNext(null), { s: 1, e: 1 });
  assert.deepEqual(rowNext({ s: 3, e: 6 }), { s: 3, e: 7 });
  assert.deepEqual(rowNext({ s: 3, e: 14 }, 14), { s: 4, e: 1 });
  assert.deepEqual(rowNext({ s: 3, e: 6 }, 14), { s: 3, e: 7 });
});

test("clipUpto drops everything after the shown episode", () => {
  const eps = [1, 2, 3, 4].map((e) => ({ e }));
  assert.deepEqual(clipUpto(eps, 2).map((x) => x.e), [1, 2]);
  assert.equal(clipUpto(eps, undefined).length, 4);
});
