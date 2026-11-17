import { test } from "node:test";
import assert from "node:assert/strict";
import { pairInCast } from "../../src/lib/character-pair";

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
