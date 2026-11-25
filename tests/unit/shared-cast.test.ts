import { test } from "node:test";
import assert from "node:assert/strict";
import { titleSplits, sameTitle, commonIds } from "../../src/lib/shared-cast";

test("splits three words into two or three titles, fewest parts first", () => {
  assert.deepEqual(titleSplits("rumble fish matrix"), [
    ["rumble", "fish matrix"], ["rumble fish", "matrix"], ["rumble", "fish", "matrix"],
  ]);
});

test("a single word or a long sentence is not split", () => {
  assert.deepEqual(titleSplits("matrix"), []);
  assert.deepEqual(titleSplits("a b c d e f g"), []);
});

test("sameTitle ignores case, punctuation, accents and a leading The", () => {
  assert.ok(sameTitle("matrix", "The Matrix"));
  assert.ok(sameTitle("rumble fish", "Rumble Fish"));
  assert.ok(!sameTitle("fish", "Rumble Fish"));
  assert.ok(!sameTitle("", ""));
});

test("commonIds keeps people in every list", () => {
  assert.deepEqual(commonIds([[1, 2, 3], [3, 2, 9], [2, 3]]), [2, 3]);
  assert.deepEqual(commonIds([]), []);
});
