import test from "node:test";
import assert from "node:assert/strict";
import { cleanStopped, clockLabel, durLabel, minutesLeft, nudge, stoppedLabel, stoppedPct, stoppedShort, stoppedWrite, hasStopped } from "../../src/lib/film-resume";
import { packMark, unpackMarks, sameMark, withStopped, withPlace } from "../../src/lib/marks";
import { filmResume, rankUpNext } from "../../src/lib/upnext";
import type { LibItem } from "../../src/lib/types";

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-11-13T12:00:00Z");
let n = 0;
const film = (p: Partial<LibItem> = {}): LibItem => { const id = ++n; return { key: `movie:${id}`, type: "movie", id, title: `F${id}`, year: "2019", poster: "/p.jpg", status: "watching", priority: "someday", rating: 0, note: "", progress: null, added: NOW - 30 * DAY, watchedAt: null, updated: NOW - 2 * DAY, ...p }; };
const ctx = () => ({ now: NOW, facts: new Map(), hasServices: false });

test("labels: clock, duration, stopped line", () => {
  assert.equal(clockLabel(52), "52:00");
  assert.equal(clockLabel(72), "1:12:00");
  assert.equal(durLabel(108), "1h 48m");
  assert.equal(durLabel(120), "2h");
  assert.equal(stoppedLabel(52, 108), "stopped at 52:00 of 1h 48m");
  assert.equal(stoppedLabel(52, null), "stopped at 52:00");
  assert.equal(stoppedShort(52, 108), "52:00 of 1h 48m");
  assert.equal(stoppedPct(52, 108), 48);
  assert.equal(stoppedPct(52, null), 0);
  assert.equal(minutesLeft(52, 108), 56);
  assert.equal(minutesLeft(200, 108), 0);
  assert.equal(minutesLeft(52, null), null);
});

test("cleanStopped and nudge keep the time inside 0..runtime", () => {
  assert.equal(cleanStopped(52.9, 108), 52);
  assert.equal(cleanStopped(0, 108), null);
  assert.equal(cleanStopped(300, 108), 108);
  assert.equal(cleanStopped(NaN, 108), null);
  assert.equal(cleanStopped(40, null), 40);
  assert.equal(nudge(3, -5, 108), 0);
  assert.equal(nudge(106, 5, 108), 108);
  assert.equal(nudge(52, 5, null), 57);
});

test("stoppedWrite: writes a change once, clears at 0, ignores an unchanged value", () => {
  assert.deepEqual(stoppedWrite(52, 108, null), { min: 52, of: 108 });
  assert.equal(stoppedWrite(52, 108, 52), null);
  assert.deepEqual(stoppedWrite(0, 108, 52), { min: null, of: null });
  assert.equal(stoppedWrite(0, 108, null), null);
  assert.deepEqual(stoppedWrite(40, null, null), { min: 40, of: null });
});

test("a Watching film carries its stopped time in the packed mark; others do not", () => {
  const m = { status: "watching" as const, priority: "someday" as const, rich: false, stopped: 52 };
  assert.equal(packMark(m), "gs--t52");
  assert.equal(unpackMarks({ a: packMark(m) }).a.stopped, 52);
  assert.equal(packMark({ ...m, status: "watched" }), "ws--");
  assert.equal(unpackMarks({ a: "gs--" }).a.stopped, undefined);
  assert.equal(unpackMarks({ a: "gs--2.3" }).a.stopped, undefined);
  assert.equal(unpackMarks({ a: "gs--2.3" }).a.progress?.s, 2);
});

test("sameMark sees a moved stopped time; withStopped sets and clears it", () => {
  const a = { status: "watching" as const, priority: "someday" as const, rich: false, stopped: 52 };
  assert.equal(sameMark(a, { ...a, stopped: 57 }), false);
  assert.equal(sameMark(a, { ...a }), true);
  assert.equal(withStopped(a, 57)?.stopped, 57);
  assert.equal(withStopped(a, undefined)?.stopped, undefined);
  assert.equal(withStopped(null, 5), null);
  assert.equal(withPlace(a, null)?.stopped, 52);
});

test("hasStopped needs a Watching film with minutes", () => {
  assert.equal(hasStopped(film({ stoppedMin: 52 })), true);
  assert.equal(hasStopped(film()), false);
  assert.equal(hasStopped(film({ stoppedMin: 52, status: "watchlist" })), false);
  assert.equal(hasStopped(film({ stoppedMin: 52, type: "tv" })), false);
});

test("filmResume: a fresh Watching film with a stopped time is a Resume card; untouched for 6 weeks it is left to 'Still watching?'", () => {
  const f = film({ stoppedMin: 52, stoppedOf: 108 });
  const p = filmResume(f, ctx())!;
  assert.equal(p.kind, "resume");
  assert.equal(p.why, "52:00 of 1h 48m");
  assert.deepEqual(p.resume, { min: 52, of: 108 });
  assert.equal(filmResume(film({ stoppedMin: 52, updated: NOW - 50 * DAY }), ctx()), null);
  assert.equal(filmResume(film(), ctx()), null);
  assert.equal(filmResume(film({ stoppedMin: 52, status: "partial" }), ctx()), null);
});

test("rankUpNext: a Resume card leads with the other in-progress titles; a film without a stopped time is a normal Continue card", () => {
  const withTime = film({ stoppedMin: 52, stoppedOf: 108 });
  const without = film({ updated: NOW - 3 * DAY });
  const wl = [1, 2, 3].map(() => film({ status: "watchlist" }));
  const out = rankUpNext([without, ...wl, withTime], ctx());
  assert.equal(out[0].key, withTime.key);
  assert.equal(out[0].kind, "resume");
  assert.equal(out.find((x) => x.key === without.key)!.kind, "continue");
});
