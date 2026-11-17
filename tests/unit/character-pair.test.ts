import { test } from "node:test";
import assert from "node:assert/strict";
import { coverCast, pairInCast } from "../../src/lib/character-pair";

const cast = [
  { id: 1, name: "Jim Parsons", photo: null, role: "Sheldon Cooper" },
  { id: 2, name: "Johnny Galecki", photo: null, role: "Leonard Hofstadter" },
  { id: 3, name: "Kaley Cuoco", photo: null, role: "Penny" },
  { id: 4, name: "Mary Cooper Actor", photo: null, role: "Mary Cooper" },
];

test("finds two characters in one cast", () => {
  const r = pairInCast(cast, ["sheldon"], ["penny"]);
  assert.equal(r?.a.name, "Jim Parsons");
  assert.equal(r?.b.name, "Kaley Cuoco");
  assert.equal(r?.rank, 2);
});
test("needs both, played by different people", () => {
  assert.equal(pairInCast(cast, ["sheldon"], ["harry"]), null);
  assert.equal(pairInCast(cast, ["sheldon"], ["sheldon"]), null);
  assert.equal(pairInCast(cast, ["gandalf"], ["penny"]), null);
});

const rookie = [
  { id: 1, name: "Nathan Fillion", photo: null, role: "John Nolan" },
  { id: 2, name: "Alyssa Diaz", photo: null, role: "Angela Lopez" },
  { id: 3, name: "Eric Winter", photo: null, role: "Tim Bradford" },
  { id: 4, name: "Melissa O'Neil", photo: null, role: "Lucy Chen" },
  { id: 5, name: "Mekia Cox", photo: null, role: "Nyla Harper" },
];
test("covers every typed word with the fewest parts", () => {
  const r = coverCast(rookie, ["nolan", "harper", "lucy", "tim"]);
  assert.deepEqual(r?.members.map((m) => m.name), ["Nathan Fillion", "Eric Winter", "Melissa O'Neil", "Mekia Cox"]);
  assert.equal(coverCast(cast, ["sheldon", "cooper"])?.members.length, 1);
  assert.equal(coverCast(cast, ["sheldon", "cooper"])?.members[0].name, "Jim Parsons");
});
test("a word nobody has means no cover", () => {
  assert.equal(coverCast(rookie, ["nolan", "zzzz"]), null);
  assert.equal(coverCast(rookie, []), null);
});
