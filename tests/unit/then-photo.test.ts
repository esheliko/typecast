import { test } from "node:test";
import assert from "node:assert/strict";
import { isOldTitle } from "../../src/lib/then-photo";

test("old enough", () => { assert.equal(isOldTitle("1981-06-12", 2026), true); assert.equal(isOldTitle("2018-01-01", 2026), true); });
test("recent", () => { assert.equal(isOldTitle("2020-05-01", 2026), false); assert.equal(isOldTitle("2026-01-01", 2026), false); });
test("unreadable", () => { assert.equal(isOldTitle("", 2026), false); assert.equal(isOldTitle(undefined, 2026), false); assert.equal(isOldTitle("abcd", 2026), false); });

import { sameImageUrl, dHash, hashDistance, pickThenUrl } from "../../src/lib/then-photo";

test("same picture by address", () => {
  assert.equal(sameImageUrl("https://image.tmdb.org/t/p/w185/abcdef123456.jpg", "https://image.tmdb.org/t/p/original/abcdef123456.jpg"), true);
  assert.equal(sameImageUrl("https://a/x.jpg", "https://a/x.jpg"), true);
  assert.equal(sameImageUrl("https://image.tmdb.org/t/p/w185/abcdef123456.jpg", "https://example.com/other-photo.jpg"), false);
});
test("dHash and distance", () => {
  const row = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const g = Array.from({ length: 8 }, () => row).flat();
  assert.equal(dHash(g), "0".repeat(64));
  assert.equal(hashDistance(dHash(g), "1".repeat(64)), 64);
});
test("pickThenUrl skips the Now photo by address and by look, never returns it", async () => {
  const now = "https://image.tmdb.org/t/p/w185/nownownow1.jpg";
  const hashes: Record<string, string> = { [now]: "0".repeat(64), "https://x/dup.jpg": "0".repeat(60) + "1111", "https://x/other.jpg": "1".repeat(64) };
  const hashOf = async (u: string) => hashes[u] ?? null;
  assert.equal(await pickThenUrl(["https://image.tmdb.org/t/p/w500/nownownow1.jpg", "https://x/dup.jpg", "https://x/other.jpg"], now, hashOf), "https://x/other.jpg");
  assert.equal(await pickThenUrl(["https://x/dup.jpg"], now, hashOf), null);
  // unreadable pixels: only the address check applies
  assert.equal(await pickThenUrl(["https://x/unknown.jpg"], now, async () => null), "https://x/unknown.jpg");
});
