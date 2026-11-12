import { test } from "node:test";
import assert from "node:assert/strict";
import { LIBRARY_TAB_ORDER, STATUS_ORDER, tabGroup } from "../../src/lib/status-order";

test("statuses read by intent", () => {
  assert.deepEqual([...LIBRARY_TAB_ORDER], ["all", "watchlist", "watching", "watched", "partial"]);
  assert.deepEqual([...STATUS_ORDER].sort(), ["partial", "watched", "watching", "watchlist"]);
});

test("watched and partial form one pair that starts at watched", () => {
  const g = LIBRARY_TAB_ORDER.map((k, i) => tabGroup(k, i));
  assert.deepEqual(g.map((x) => x.group), [null, "future", "now", "past", "past"]);
  assert.deepEqual(g.map((x) => x.pairStart), [false, false, false, true, false]);
});
