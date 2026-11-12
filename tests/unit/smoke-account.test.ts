import test from "node:test";
import assert from "node:assert/strict";
import { isSmokeAccount, isStaleSmokeAccount, smokeEmail, STALE_AFTER_MS } from "../smoke/account-rules";

const now = Date.parse("2026-11-12T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("smokeEmail builds an address that isSmokeAccount accepts", () => {
  assert.equal(smokeEmail("A1B2C3D4E5F6"), "smoke-a1b2c3d4e5f6@example.com");
  assert.ok(isSmokeAccount(smokeEmail("0123456789ab")));
});
test("smokeEmail refuses tokens that would not match the pattern", () => {
  assert.throws(() => smokeEmail("short"));
  assert.throws(() => smokeEmail("has space 1234"));
  assert.throws(() => smokeEmail("x/../../../1234"));
});
test("isSmokeAccount never matches a real-looking address", () => {
  for (const e of ["esheliko@gmail.com", "smoke@example.com", "smoke-abc@example.com", "smoke-a1b2c3d4@gmail.com", "xsmoke-a1b2c3d4@example.com", "smoke-a1b2c3d4@example.com.evil.io", "", null, undefined])
    assert.equal(isSmokeAccount(e), false, String(e));
});
test("only smoke accounts older than the limit are stale", () => {
  const e = "smoke-a1b2c3d4@example.com";
  assert.equal(isStaleSmokeAccount(e, ago(STALE_AFTER_MS + 1000), now), true);
  assert.equal(isStaleSmokeAccount(e, ago(STALE_AFTER_MS - 1000), now), false);
  assert.equal(isStaleSmokeAccount(e, ago(5 * 60_000), now), false); // a run in progress
});
test("a real user is never stale, however old", () => {
  assert.equal(isStaleSmokeAccount("esheliko@gmail.com", ago(365 * 24 * 3600_000), now), false);
  assert.equal(isStaleSmokeAccount("smoke-a1b2c3d4@example.com", null, now), false);
  assert.equal(isStaleSmokeAccount("smoke-a1b2c3d4@example.com", "not a date", now), false);
});
