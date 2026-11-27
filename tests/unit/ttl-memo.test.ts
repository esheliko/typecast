import test from "node:test";
import assert from "node:assert/strict";
import { createTtlMemo } from "../../src/lib/ttl-memo";

test("keeps an entry until its time is up", () => {
  let t = 0;
  const m = createTtlMemo<number>(1000, 10, () => t);
  m.set("a", 1);
  t = 999; assert.equal(m.get("a"), 1);
  t = 1000; assert.equal(m.get("a"), undefined);
  assert.equal(m.size, 0);
});

test("never holds more than max: expired first, then the oldest", () => {
  let t = 0;
  const m = createTtlMemo<number>(1000, 2, () => t);
  m.set("a", 1); t = 10; m.set("b", 2); t = 20; m.set("c", 3);
  assert.equal(m.get("a"), undefined);
  assert.equal(m.get("b"), 2); assert.equal(m.get("c"), 3);
  t = 5000; m.set("d", 4); m.set("e", 5); m.set("f", 6);
  assert.equal(m.size, 2);
  assert.equal(m.get("f"), 6);
});

test("setting a key again refreshes it", () => {
  let t = 0;
  const m = createTtlMemo<number>(100, 5, () => t);
  m.set("a", 1); t = 90; m.set("a", 2); t = 150;
  assert.equal(m.get("a"), 2);
});
