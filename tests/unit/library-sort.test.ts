import test from "node:test";
import assert from "node:assert/strict";
import { SORTS, isSort } from "../../src/lib/library-sort";

test("isSort accepts every defined sort key and nothing else", () => {
  for (const [k] of SORTS) assert.equal(isSort(k), true, k);
  for (const bad of [undefined, "", "Added", "random", "__proto__"]) assert.equal(isSort(bad), false, String(bad));
});

test("the default sort key exists", () => assert.ok(isSort("watched")));
