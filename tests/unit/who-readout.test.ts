import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultChoice, readoutChoice } from "../../src/lib/who-readout";
import { gapChip, readout } from "../../src/lib/who-dates";

const all = () => true;

test("readout default: the highlighted title, else the top known title, else nothing", () => {
  assert.equal(defaultChoice({ highlighted: "tv:1418", known: ["movie:5"], usable: all }), "tv:1418");
  assert.equal(defaultChoice({ highlighted: null, known: ["tv:1418", "movie:5"], usable: all }), "tv:1418");
  assert.equal(defaultChoice({ highlighted: "movie:9", known: ["tv:1418"], usable: (k) => k !== "movie:9" }), "tv:1418", "a highlight that cannot be compared is skipped");
  assert.equal(defaultChoice({ highlighted: undefined, known: [], usable: all }), null, "no arbitrary row");
  assert.equal(defaultChoice({ known: ["a", "b"], usable: (k) => k === "b" }), "b");
});

test("readout choice: preview beats a click, a click beats the default; unusable ones are skipped", () => {
  assert.equal(readoutChoice({ preview: "p", selected: "s", fallback: "d", usable: all }), "p");
  assert.equal(readoutChoice({ preview: null, selected: "s", fallback: "d", usable: all }), "s");
  assert.equal(readoutChoice({ fallback: "d", usable: all }), "d");
  assert.equal(readoutChoice({ preview: "p", selected: "s", fallback: "d", usable: (k) => k === "d" }), "d");
  assert.equal(readoutChoice({ fallback: null, usable: all }), null);
});

test("the Sara Rue sentence needs no click, and a show's-run date reads as approximate", () => {
  const bbt = { label: "The Big Bang Theory", range: { start: "2008-11-17", end: "2008-12-08" } };
  const rookie = { label: "The Rookie S2", range: { start: "2019-11-12", end: "2019-11-12" } };
  assert.match(readout(bbt, rookie), /^The Big Bang Theory \(Nov-Dec 2008\) was 11 years before The Rookie S2/);
  assert.match(readout({ ...bbt, approx: true }, rookie), /was about 11 years before/);
  assert.equal(gapChip({ dir: "after", months: 12 }, true), "about 1 year after");
});
