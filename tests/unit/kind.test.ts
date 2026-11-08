import test from "node:test";
import assert from "node:assert/strict";
import { isKind, mixed, ofKind } from "../../src/lib/kind";

const m = { type: "movie", key: "movie:1" }, t = { type: "tv", key: "tv:2" };

test("ofKind keeps everything for all, and only that type otherwise", () => {
  assert.deepEqual(ofKind([m, t], "all"), [m, t]);
  assert.deepEqual(ofKind([m, t], "movie"), [m]);
  assert.deepEqual(ofKind([m, t], "tv"), [t]);
  assert.deepEqual(ofKind([m], "tv"), []);
});
test("mixed only when both kinds are present", () => {
  assert.equal(mixed([]), false);
  assert.equal(mixed([m, m]), false);
  assert.equal(mixed([t]), false);
  assert.equal(mixed([m, t]), true);
});
test("isKind", () => {
  for (const k of ["all", "movie", "tv"]) assert.ok(isKind(k));
  for (const k of ["", "film", undefined, null, 1]) assert.ok(!isKind(k));
});
