import { test } from "node:test";
import assert from "node:assert/strict";
import { roleLabel } from "../../src/lib/roster";

test("role labels", () => {
  assert.equal(roleLabel("Self"), "Appears as themselves");
  assert.equal(roleLabel("Himself - Host"), "Appears as themselves - Host");
  assert.equal(roleLabel(""), "");
  assert.equal(roleLabel("Waiter (uncredited)"), "Waiter");
});
