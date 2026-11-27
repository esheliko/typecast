import test from "node:test";
import assert from "node:assert/strict";
import { createBatcher, pool, splitLines } from "../../src/lib/batcher";

const manual = () => { const q: (() => void)[] = []; return { setTimer: (f: () => void) => { q.push(f); return 0; }, run: () => q.splice(0).forEach((f) => f()), q }; };

test("questions in one round go out as one request, duplicates share an answer", async () => {
  const t = manual(); const sent: string[][] = [];
  const ask = createBatcher<number>(async (keys, s) => { sent.push(keys); keys.forEach((k) => s.answer(k, k.length)); }, { setTimer: t.setTimer });
  const a = ask("aa"), b = ask("bbb"), c = ask("aa");
  assert.equal(t.q.length, 1);
  t.run();
  assert.deepEqual(await Promise.all([a, b, c]), [2, 3, 2]);
  assert.deepEqual(sent, [["aa", "bbb"]]);
});

test("one failing key leaves the others alone; unanswered keys fail when the request ends", async () => {
  const t = manual();
  const ask = createBatcher<number>(async (keys, s) => { s.answer(keys[0], 1); s.fail(keys[1]); }, { setTimer: t.setTimer });
  const r = [ask("a"), ask("b"), ask("c")].map((p) => p.then((v) => v, () => "fail"));
  t.run();
  assert.deepEqual(await Promise.all(r), [1, "fail", "fail"]);
});

test("a request that throws fails every key; a later round starts fresh", async () => {
  const t = manual(); let n = 0;
  const ask = createBatcher<number>(async (keys, s) => { if (n++ === 0) throw new Error("down"); s.answer(keys[0], 7); }, { setTimer: t.setTimer });
  const first = ask("a").then(() => "ok", () => "fail");
  t.run();
  assert.equal(await first, "fail");
  const second = ask("a"); t.run();
  assert.equal(await second, 7);
});

test("a round bigger than max is split into several requests", async () => {
  const t = manual(); const sent: string[][] = [];
  const ask = createBatcher<number>(async (keys, s) => { sent.push(keys); keys.forEach((k) => s.answer(k, 1)); }, { setTimer: t.setTimer, max: 2 });
  const all = ["a", "b", "c", "d", "e"].map(ask);
  t.run(); await Promise.all(all);
  assert.deepEqual(sent, [["a", "b"], ["c", "d"], ["e"]]);
});

test("splitLines keeps an unfinished line for the next piece", () => {
  assert.deepEqual(splitLines('{"a":1}\n{"b"'), { lines: ['{"a":1}'], rest: '{"b"' });
  assert.deepEqual(splitLines("x\n\ny\n"), { lines: ["x", "y"], rest: "" });
});

test("pool never runs more than n at once", async () => {
  let live = 0, peak = 0;
  await pool([1, 2, 3, 4, 5, 6], 2, async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; });
  assert.equal(peak, 2);
});
