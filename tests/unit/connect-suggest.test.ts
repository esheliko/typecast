import test from "node:test";
import assert from "node:assert/strict";
import { rankCands, whyLine } from "../../src/lib/connect-suggest";

const c = (name: string, links: number, mine: number, via: string[] = []) => ({ item: name, links, mine, via });

test("more shared titles beat a library-only candidate; library presence breaks ties", () => {
  const out = rankCands([c("lib", 0, 2), c("link3", 3, 0), c("link1", 1, 0), c("link1mine", 1, 1), c("none", 0, 0)], 10).map((x) => x.item);
  assert.deepEqual(out, ["link3", "link1mine", "lib", "link1"].sort((a, b) => out.indexOf(a) - out.indexOf(b)));
  assert.equal(out[0], "link3");
  assert.ok(out.indexOf("link1mine") < out.indexOf("link1"));
  assert.ok(!out.includes("none"));
});

test("limit applies", () => {
  assert.equal(rankCands([c("a", 1, 0), c("b", 2, 0), c("c", 3, 0)], 2).length, 2);
});

test("why lines", () => {
  assert.equal(whyLine({ links: 2, via: ["Heat", "Ronin"], mine: 1 }, "De Niro", "title"), "2 titles with De Niro (Heat and Ronin) · in your library");
  assert.equal(whyLine({ links: 4, via: ["A", "B", "C", "D"], mine: 0 }, "X", "actor"), "4 actors in common: A, B and 2 more");
  assert.equal(whyLine({ links: 0, via: [], mine: 3 }, "X", "title"), "3 of yours");
});
