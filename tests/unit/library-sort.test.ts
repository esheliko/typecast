import test from "node:test";
import assert from "node:assert/strict";
import { SORTS, isSort, orderItems } from "../../src/lib/library-sort";

test("isSort accepts every defined sort key and nothing else", () => {
  for (const [k] of SORTS) assert.equal(isSort(k), true, k);
  for (const bad of [undefined, "", "Added", "random", "__proto__"]) assert.equal(isSort(bad), false, String(bad));
});

test("the default sort key exists", () => assert.ok(isSort("watched")));
import type { LibItem } from "../../src/lib/types";
const it = (title: string, rating: number, year = "2000"): LibItem => ({ title, rating, year } as LibItem);
const items = [it("B", 3), it("A", 0), it("C", 5), it("D", 0)];
const names = (l: LibItem[]) => l.map((x) => x.title).join("");

test("default order is kept, flip reverses it", () => {
  assert.equal(names(orderItems(items, "added", false, false)), "BACD");
  assert.equal(names(orderItems(items, "added", true, false)), "DCAB");
});
test("sort by rating, flipped puts lowest first", () => {
  assert.equal(names(orderItems(items, "rating", false, false)), "CBAD");
  assert.equal(names(orderItems(items, "rating", true, false)), "DABC");
});
test("unrated keeps only unrated titles, still sortable and flippable", () => {
  assert.equal(names(orderItems(items, "title", false, true)), "AD");
  assert.equal(names(orderItems(items, "title", true, true)), "DA");
});
