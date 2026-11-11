import { test } from "node:test";
import assert from "node:assert/strict";
import { isOldTitle } from "../../src/lib/then-photo";

test("old enough", () => { assert.equal(isOldTitle("1981-06-12", 2026), true); assert.equal(isOldTitle("2018-01-01", 2026), true); });
test("recent", () => { assert.equal(isOldTitle("2020-05-01", 2026), false); assert.equal(isOldTitle("2026-01-01", 2026), false); });
test("unreadable", () => { assert.equal(isOldTitle("", 2026), false); assert.equal(isOldTitle(undefined, 2026), false); assert.equal(isOldTitle("abcd", 2026), false); });
