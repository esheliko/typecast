import { test } from "node:test";
import assert from "node:assert/strict";
import { wikiGuesses } from "../../src/lib/fandom";

test("wikiGuesses covers joined, hyphenated and initials forms", () => {
  const g = wikiGuesses("How I Met Your Mother");
  assert.ok(g.includes("howimetyourmother") && g.includes("how-i-met-your-mother") && g.includes("himym"));
});
test("wikiGuesses tries the title without a leading The", () => {
  const g = wikiGuesses("The Office");
  assert.ok(g.includes("theoffice") && g.includes("office"));
});
test("wikiGuesses never makes an invalid address", () => assert.deepEqual(wikiGuesses("!!"), []));
