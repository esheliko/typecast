import test from "node:test";
import assert from "node:assert/strict";
import { feedLibrary, newCalendarToken, tokenFromFile } from "../../src/lib/calendar-token";

test("tokens are 32 URL-safe characters and differ each time", () => {
  const a = newCalendarToken(), b = newCalendarToken();
  assert.match(a, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(a, b);
  assert.equal(tokenFromFile(`${a}.ics`), a);
});

test("only well-formed <token>.ics names are accepted", () => {
  for (const bad of ["short.ics", `${"a".repeat(32)}`, `${"a".repeat(32)}.ics.txt`, `${"a".repeat(31)}!.ics`, `../${"a".repeat(32)}.ics`, `${"a".repeat(65)}.ics`, ""]) assert.equal(tokenFromFile(bad), null, bad);
});

test("feedLibrary: wrong shapes give null; bad rows are skipped; defaults are safe", () => {
  assert.equal(feedLibrary(null), null);
  assert.equal(feedLibrary({ country: "GB" }), null);
  const r = feedLibrary({ country: "", items: [{ type: "movie", id: 5, title: "A", status: "weird", priority: "must" }, { type: "show", id: 1 }, { type: "tv", id: "x" }, null, { type: "tv", id: 9, title: "B", status: "watching", updated: 5 }] })!;
  assert.equal(r.country, "US");
  assert.deepEqual(r.lib.map((l) => [l.key, l.status, l.priority]), [["movie:5", "watchlist", "must"], ["tv:9", "watching", "someday"]]);
});
