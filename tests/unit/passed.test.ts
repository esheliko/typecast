import test from "node:test";
import assert from "node:assert/strict";
import { showChance, roll, faded, type Passed } from "../../src/lib/passed";

const DAY = 24 * 3600 * 1000;
const NOW = 1_700_000_000_000;

test("showChance is 1 for a title never passed over", () => assert.equal(showChance(undefined, NOW), 1));

test("showChance falls with each pass and stops at the floor", () => {
  const c = (n: number) => showChance([n, NOW], NOW);
  assert.ok(Math.abs(c(1) - 0.55) < 1e-9);
  assert.ok(c(2) < c(1) && c(3) < c(2));
  assert.equal(c(8), 0.04);
  assert.equal(c(50), 0.04);
});

test("a pass is forgiven every 21 days", () => {
  assert.equal(showChance([2, NOW - 20 * DAY], NOW), showChance([2, NOW], NOW));
  assert.equal(showChance([2, NOW - 21 * DAY], NOW), showChance([1, NOW], NOW));
  assert.equal(showChance([1, NOW - 21 * DAY], NOW), 1);
  assert.equal(showChance([1, NOW - 400 * DAY], NOW), 1);
});

test("roll is deterministic, in [0,1) and depends on key and salt", () => {
  assert.equal(roll("movie:603", 7), roll("movie:603", 7));
  assert.notEqual(roll("movie:603", 7), roll("movie:603", 8));
  assert.notEqual(roll("movie:603", 7), roll("movie:604", 7));
  for (let i = 0; i < 200; i++) { const r = roll(`tv:${i}`, i); assert.ok(r >= 0 && r < 1); }
});

test("roll is roughly uniform", () => {
  let below = 0;
  for (let i = 0; i < 2000; i++) if (roll(`k${i}`, 1) < 0.5) below++;
  assert.ok(below > 850 && below < 1150, String(below));
});

test("faded never hides a title that was not passed over, and always hides the same ones", () => {
  const empty: Passed = new Map();
  for (let i = 0; i < 100; i++) assert.equal(faded(empty, `m:${i}`, 3), false);
  const passed: Passed = new Map([["m:1", [8, Date.now()]]]);
  assert.equal(faded(passed, "m:1", 5), faded(passed, "m:1", 5));
});
