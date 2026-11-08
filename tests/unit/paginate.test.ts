import test from "node:test";
import assert from "node:assert/strict";
import { fetchAll } from "../../src/lib/paginate";
import { packMark, unpackMarks } from "../../src/lib/marks";

const source = (n: number) => Array.from({ length: n }, (_, i) => i);
const pager = (rows: number[], calls: [number, number][] = []) => async (from: number, to: number) => {
  calls.push([from, to]);
  return { data: rows.slice(from, to + 1), error: null };
};

test("fetchAll returns every row across pages, in order", async () => {
  for (const n of [0, 1, 999, 1000, 1001, 2500, 3000]) assert.deepEqual(await fetchAll(pager(source(n))), source(n), String(n));
});

test("fetchAll stops after a short page and asks for one more only when a page is full", async () => {
  const calls: [number, number][] = [];
  await fetchAll(pager(source(2000), calls), 1000);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("fetchAll throws on a page error instead of returning a partial list", async () => {
  await assert.rejects(fetchAll(async (from) => (from ? { data: null, error: { message: "boom" } } : { data: source(1000), error: null })), /boom/);
});

test("packed marks round-trip", () => {
  const marks = [
    { status: "watching", priority: "someday", rich: false }, { status: "partial", priority: "must", rich: true },
    { status: "watchlist", priority: "must", rich: false }, { status: "watched", priority: "someday", rich: true },
  ] as const;
  const back = unpackMarks(Object.fromEntries(marks.map((m, i) => [`movie:${i}`, packMark(m)])));
  marks.forEach((m, i) => assert.deepEqual(back[`movie:${i}`], m));
});
