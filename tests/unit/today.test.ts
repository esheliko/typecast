import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dayIn, todayFor, tzOf } from "../../src/lib/today";

describe("today in the user's country", () => {
  // 2026-11-09 22:00 UTC is already 10 Nov 03:30 in India.
  const t = Date.UTC(2026, 10, 9, 22, 0);
  test("is a day ahead of UTC for India in the small hours", () => {
    assert.equal(dayIn(t), "2026-11-09");
    assert.equal(todayFor("IN", t), "2026-11-10");
  });
  test("is behind UTC for the US east coast", () => {
    assert.equal(todayFor("US", Date.UTC(2026, 10, 10, 2, 0)), "2026-11-09");
  });
  test("follows daylight saving", () => {
    assert.equal(todayFor("GB", Date.UTC(2026, 5, 30, 23, 30)), "2026-07-01");
    assert.equal(todayFor("GB", Date.UTC(2026, 0, 30, 23, 30)), "2026-01-30");
  });
  test("falls back to UTC for unknown or missing countries", () => {
    assert.equal(tzOf("ZZ"), "UTC");
    assert.equal(tzOf(undefined), "UTC");
    assert.equal(todayFor("", t), "2026-11-09");
    assert.equal(dayIn(t, "Not/AZone"), "2026-11-09");
  });
});
