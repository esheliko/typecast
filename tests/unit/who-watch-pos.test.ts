import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWatch, serializeWatch, type Watch } from "../../src/lib/watching";

const base = { type: "tv", id: 79744, title: "The Rookie", year: "2018", poster: null, started: 1_000_000, runtime: 42, s: 2, e: 8 };
const parse = (o: object) => parseWatch(JSON.stringify(o), 1_000_000 + 60_000);

test("a watch with no position field reads exactly as before", () => {
  const w = parse(base)!;
  assert.equal(w.s, 2); assert.equal(w.e, 8); assert.equal(w.pos, undefined);
});

test("episode unknown, season unknown and specials survive the cookie, with s/e kept as a safe guess for the older sheet", () => {
  const a = parse({ ...base, s: 2, e: 1, pos: { s: 2, e: null } })!;
  assert.deepEqual(a.pos, { s: 2, e: null }); assert.equal(a.s, 2); assert.equal(a.e, 1);
  const b = parse({ ...base, s: 1, e: 1, pos: { s: null, e: null } })!;
  assert.deepEqual(b.pos, { s: null, e: null });
  const c = parse({ ...base, s: 1, e: 1, pos: { s: 0, e: 3 } })!;
  assert.deepEqual(c.pos, { s: 0, e: 3 }, "season 0 is the specials");
  const round = parseWatch(serializeWatch(a as Watch), 1_000_000 + 60_000)!;
  assert.deepEqual(round.pos, { s: 2, e: null });
});

test("a malformed position is ignored, never breaking the watch", () => {
  for (const pos of [{ s: "x", e: 1 }, { s: -1, e: 1 }, { s: null, e: 4 }, "nope", 5, { s: 1.5, e: 2 }]) {
    const w = parse({ ...base, pos })!;
    assert.ok(w, "still a watch");
    assert.equal(w.pos, undefined, JSON.stringify(pos));
    assert.equal(w.s, 2);
  }
});

test("films ignore a position", () => {
  const w = parse({ type: "movie", id: 603, title: "The Matrix", year: "1999", poster: null, started: 1_000_000, runtime: 136, pos: { s: 2, e: 3 } })!;
  assert.equal(w.pos, undefined);
});
