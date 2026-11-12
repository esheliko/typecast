import { test } from "node:test";
import assert from "node:assert/strict";
import { packMark, placeOf, sameMark, unpackMarks, withPlace } from "../../src/lib/marks";
import { lineCacheKey, lineTag, lineTags, markLine, NONE, pageFor, type SpoilerLine } from "../../src/lib/spoiler-line";
import { cacheKey } from "../../src/lib/who-client";
import { infoQuery, withLine, type GlimpseSpec } from "../../src/lib/glimpse";
import type { Mark } from "../../src/lib/types";

const m = (over: Partial<Mark> = {}): Mark => ({ status: "watching", priority: "someday", rich: false, ...over });

test("packed marks: an old 4-character string still unpacks, with no place", () => {
  assert.deepEqual(unpackMarks({ "tv:1": "gs--" })["tv:1"], { status: "watching", priority: "someday", rich: false });
  assert.deepEqual(unpackMarks({ "tv:1": "pmrS" })["tv:1"], { status: "partial", priority: "must", rich: true, fresh: "season" });
});

test("packed marks: a Watching series carries its saved place and it round-trips", () => {
  for (const x of [m({ progress: { s: 2, e: 8 } }), m({ progress: { s: 12, e: 104 }, rich: true, fresh: "episode", priority: "must" })]) {
    const packed = packMark(x);
    assert.deepEqual(unpackMarks({ k: packed }).k, x);
  }
  assert.equal(packMark(m({ progress: { s: 2, e: 8 } })), "gs--2.8");
});

test("packed marks: no place is added for a row that is not Watching, or has none", () => {
  assert.equal(packMark(m({ status: "watched", progress: { s: 3, e: 3 } })).length, 4);
  assert.equal(packMark(m({ progress: null })).length, 4);
  assert.equal(packMark(m({ progress: { s: 0, e: 0 } })).length, 4);
  assert.equal(unpackMarks({ k: "gs--x.y" }).k.progress, undefined);
});

test("sameMark: the saved place counts only for a Watching series", () => {
  assert.equal(sameMark(m({ progress: { s: 1, e: 2 } }), m({ progress: { s: 1, e: 2 } })), true);
  assert.equal(sameMark(m({ progress: { s: 1, e: 2 } }), m({ progress: { s: 1, e: 3 } })), false);
  assert.equal(sameMark(m({ progress: { s: 1, e: 2 } }), m()), false);
  assert.equal(sameMark(m({ status: "watched", progress: { s: 1, e: 2 } }), m({ status: "watched" })), true);
  assert.equal(sameMark(undefined, undefined), true);
  assert.equal(sameMark(m(), undefined), false);
});

test("withPlace: moves the place, keeps the rest, can set the status, needs something to stand on", () => {
  assert.deepEqual(withPlace(m({ rich: true, priority: "must" }), { s: 2, e: 3 }), { status: "watching", priority: "must", rich: true, progress: { s: 2, e: 3 } });
  assert.equal(withPlace(m({ progress: { s: 2, e: 3 } }), null)?.progress, null);
  assert.equal(withPlace(null, { s: 1, e: 1 }), null);
  assert.deepEqual(withPlace(null, { s: 1, e: 1 }, "watching"), { status: "watching", priority: "someday", rich: false, progress: { s: 1, e: 1 } });
  assert.equal(withPlace(m({ status: "watchlist" }), { s: 1, e: 4 }, "watching")?.status, "watching");
  assert.deepEqual(placeOf(withPlace(m({ status: "partial" }), { s: 1, e: 4 })), null);
});

test("lineTag / lineTags: every distinct line is a distinct tag", () => {
  const lines: SpoilerLine[] = [NONE, { kind: "series-only" }, { kind: "upto", s: 1, e: 12 }, { kind: "upto", s: 11, e: 2 }];
  assert.equal(new Set(lines.map(lineTag)).size, lines.length);
  assert.equal(lineTags(["tv:1", "tv:2"], (k) => (k === "tv:1" ? lines[2] : NONE)), "u1.12,.");
});

test("markLine: the browser reaches the same line as the server from Mark", () => {
  assert.deepEqual(markLine("tv:1", m({ progress: { s: 2, e: 8 } })), { kind: "upto", s: 2, e: 8 });
  assert.deepEqual(markLine("tv:1", m()), { kind: "series-only" });
  assert.deepEqual(markLine("tv:1", m({ status: "watched", progress: { s: 2, e: 8 } })), NONE);
  assert.deepEqual(markLine("movie:1", m()), NONE);
  assert.deepEqual(markLine("tv:1", undefined), NONE);
  assert.deepEqual(markLine("tv:1", m(), { page: { key: "tv:1", spoilersShown: true } }), NONE);
  assert.deepEqual(markLine("tv:1", m(), { revealed: true }), NONE);
});

test("lineCacheKey: a moved saved place is another entry; without a line the key is as before", () => {
  const a = lineCacheKey({ line: { kind: "upto", s: 2, e: 3 } }), b = lineCacheKey({ line: { kind: "upto", s: 2, e: 4 } });
  assert.notEqual(a, b);
  assert.notEqual(a, lineCacheKey({ line: { kind: "series-only" } }));
  assert.equal(lineCacheKey({ reveal: true }), "!".replace("!", ".!"));
  assert.equal(lineCacheKey({ page: { key: "tv:1", spoilersShown: true } }), "tv:1+");
});

test("cacheKey: the same URL under another line tag is another entry", () => {
  assert.equal(cacheKey("/api/x"), "/api/x");
  assert.notEqual(cacheKey("/api/x", "u1.2"), cacheKey("/api/x", "u1.3"));
});

test("pageFor: pg/ps only when the switch shows spoilers and the request is about the page's own title", () => {
  const on = { key: "tv:79744", spoilersShown: true }, off = { key: "tv:79744", spoilersShown: false };
  assert.deepEqual(pageFor(on, "tv:79744"), on);
  assert.deepEqual(pageFor(on, "tv-79744"), on);
  assert.equal(pageFor(off, "tv:79744"), null);
  assert.equal(pageFor(on, "tv:1"), null);
  assert.equal(pageFor(null, "tv:79744"), null);
  assert.equal(pageFor(on, undefined), null);
});

const spec = (key: string, extra: object = {}): GlimpseSpec => ({ heading: "x", tabs: [{ label: "x", q: "x" }, { label: "r", q: "r", info: { key: "tv:2", pid: 1 } }], info: { key, pid: 1, ...extra } });
const lineOf = (k: string, page: { key: string; spoilersShown: boolean } | null = null) => markLine(k, k === "tv:1" ? m({ progress: { s: 2, e: 3 } }) : m(), { page });

test("withLine: every question carries the line of its own title; the About query keys on it", () => {
  const s = withLine(spec("tv:1"), lineOf, null);
  assert.equal(s.info?.lt, "u2.3");
  assert.equal(s.tabs[1].info?.lt, "s");
  assert.notEqual(infoQuery(s.info!), infoQuery(withLine(spec("tv:1"), (k) => markLine(k, m({ progress: { s: 2, e: 4 } })), null).info!));
  assert.equal(infoQuery({ key: "tv:1", pid: 1 }), "k=tv%3A1&p=1");
});

test("withLine: a popup of the page's own title gets pg/ps only while the page shows spoilers", () => {
  const on = withLine(spec("tv:1"), lineOf, { key: "tv:1", spoilersShown: true });
  assert.equal(on.info?.pg, "tv-1"); assert.equal(on.info?.ps, true); assert.equal(on.info?.lt, ".");
  assert.equal(on.tabs[1].info?.pg, undefined);
  const off = withLine(spec("tv:1"), lineOf, { key: "tv:1", spoilersShown: false });
  assert.equal(off.info?.pg, undefined); assert.equal(off.info?.lt, "u2.3");
});

test("withLine: a spec that already names the page keeps it; a person-only question has no line", () => {
  const s = withLine(spec("tv:1", { pg: "tv-1" }), lineOf, { key: "tv:9", spoilersShown: true });
  assert.equal(s.info?.pg, "tv-1"); assert.equal(s.info?.ps, undefined);
  assert.equal(withLine({ heading: "p", tabs: [{ label: "p", q: "p" }], info: { pid: 5 } }, lineOf, null).info?.lt, undefined);
});
