import test from "node:test";
import assert from "node:assert/strict";
import { addCounts, chunks, parseBackup, planItem, tally, type BackupItem } from "../../src/lib/backup";

const item = (o: Record<string, unknown> = {}) => ({ key: "movie:603", type: "movie", id: 603, title: "The Matrix", year: "1999", poster: "/a.jpg", status: "watched", priority: "someday", rating: 5, note: "", progress: null, added: 1700000000000, watchedAt: 1700000000000, ...o });
const file = (library: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ exportedAt: "2026-01-01T00:00:00Z", profile: { country: "US", services: [8], serviceNames: { "8": "Netflix" }, details: ["director"], letterboxd: null }, library, ...extra });
const bad = (text: string) => { const r = parseBackup(text); assert.equal(r.ok, false); return r.ok ? "" : r.error; };

test("a real export parses", () => {
  const r = parseBackup(file([item(), item({ key: "tv:1", type: "tv", id: 1, progress: { s: 2, e: 3 }, watchedAt: null })]));
  assert.ok(r.ok);
  assert.equal(r.ok && r.backup.library.length, 2);
  assert.deepEqual(r.ok && r.backup.profile?.details, ["director"]);
});
test("an empty library and a missing profile are fine", () => {
  const r = parseBackup(JSON.stringify({ library: [] }));
  assert.ok(r.ok && r.backup.library.length === 0 && r.backup.profile === null);
});
test("rejects non-backups", () => {
  bad("nope"); bad("[]"); bad("{}"); bad(JSON.stringify({ library: "x" })); bad(JSON.stringify({ library: [], exportedAt: "yesterday-ish" }));
});
test("rejects bad items", () => {
  for (const o of [{ type: "game" }, { id: 0 }, { id: 1.5 }, { id: "603" }, { key: "movie:1" }, { title: "" }, { status: "dropped" }, { priority: "high" }, { rating: 6 }, { rating: -1 }, { rating: 2.5 },
    { note: 5 }, { poster: "http://x" }, { progress: { s: 0, e: 1 } }, { progress: "1x2" }, { added: -1 }, { added: "now" }, { watchedAt: "x" }, { year: 1999 }]) {
    assert.match(bad(file([item(o)])), /Title 1/, JSON.stringify(o));
  }
  assert.match(bad(file([item(), 5])), /Title 2/);
});
test("rejects duplicates and bad profiles", () => {
  assert.match(bad(file([item(), item()])), /twice/);
  for (const p of [{ country: "usa" }, { services: ["8"] }, { serviceNames: { x: "y" } }, { details: ["nope"] }, { details: ["director", "director"] }]) {
    assert.match(bad(file([item()], { profile: { country: "US", services: [], serviceNames: {}, details: [], ...p } })), /profile/, JSON.stringify(p));
  }
});
test("extra keys are ignored", () => assert.ok(parseBackup(file([item({ future: 1 })])).ok));

const inc = (o: Partial<BackupItem> = {}): BackupItem => ({ type: "tv", id: 1, title: "T", year: "", poster: null, status: "watched", priority: "must", rating: 4, note: "great", progress: { s: 2, e: 5 }, added: 1, watchedAt: null, ...o });
test("planItem: missing titles are added", () => assert.deepEqual(planItem(undefined, inc()), { kind: "add" }));
test("planItem: only empty fields are filled", () => {
  assert.deepEqual(planItem({ rating: 0, note: "", progress_season: null }, inc()), { kind: "fill", fills: { rating: 4, note: "great", progress_season: 2, progress_episode: 5 } });
  assert.deepEqual(planItem({ rating: 3, note: "mine", progress_season: 1 }, inc()), { kind: "same" });
  assert.deepEqual(planItem({ rating: 3, note: "  ", progress_season: 1 }, inc()), { kind: "fill", fills: { note: "great" } });
});
test("planItem: nothing to fill from an empty backup entry", () => assert.deepEqual(planItem({ rating: 0, note: "", progress_season: null }, inc({ rating: 0, note: "", progress: null })), { kind: "same" }));
test("tally, addCounts and chunks", () => {
  assert.deepEqual(tally([{ kind: "add" }, { kind: "same" }, { kind: "same" }, { kind: "fill", fills: {} }]), { added: 1, filled: 1, same: 2 });
  assert.deepEqual(addCounts({ added: 1, filled: 2, same: 3 }, { added: 1, filled: 1, same: 1 }), { added: 2, filled: 3, same: 4 });
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 2), []);
});
