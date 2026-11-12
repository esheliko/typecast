import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MaskableCredit } from "../../src/lib/spoiler-mask";
import { heldHit, holdBackCredits, isWatchingSeries, maskCreditItem, seenMark } from "../../src/lib/spoiler-mask";
import { pickSeenIn, type KnownTitle } from "../../src/lib/who-known";
import { NONE } from "../../src/lib/spoiler-line";

const cr = (key: string, type = "tv"): MaskableCredit & { role: string; date: string } => ({ key, type, eps: 62, cids: ["a", "b"], role: "Nell", date: "2018-10-16" });

describe("seenMark", () => {
  it("does not count a Watching series, keeps everything else", () => {
    assert.equal(seenMark("tv:1", { status: "watching", rich: false }), undefined);
    assert.deepEqual(seenMark("tv:1", { status: "watched", rich: false }), { status: "watched", rich: false });
    assert.equal(seenMark("tv:1", { status: "partial", rich: false })?.status, "partial");
    assert.equal(seenMark("movie:1", { status: "watching", rich: false })?.status, "watching");
    assert.equal(seenMark("tv:1", undefined), undefined);
  });
  it("makes pickSeenIn skip the Watching series but still pick a Watched one", () => {
    const top: KnownTitle[] = [["tv:1", "The Rookie", "2018", "Nell", 60, 5000, 1], ["tv:2", "Old Show", "2010", "Bob", 40, 3000, 1]];
    const marks: Record<string, { status: string; rich: boolean }> = { "tv:1": { status: "watching", rich: false } };
    assert.equal(pickSeenIn(top, "x", (k) => seenMark(k, marks[k])), null);
    marks["tv:2"] = { status: "watched", rich: false };
    assert.equal(pickSeenIn(top, "x", (k) => seenMark(k, marks[k]))?.key, "tv:2");
  });
});

describe("holdBackCredits", () => {
  const lines = { "tv:1": { kind: "upto", s: 1, e: 2 } as const, "tv:2": { kind: "series-only" } as const, "tv:3": NONE };
  it("zeroes the count and ids of held-back series and marks them", () => {
    const out = holdBackCredits([cr("tv:1"), cr("tv:2"), cr("tv:3")], lines);
    assert.equal(out[0].eps, 0); assert.deepEqual(out[0].cids, []); assert.deepEqual(out[0].hidden, { kind: "upto", s: 1, e: 2 }); assert.equal(out[0].role, "Nell");
    assert.equal(out[1].eps, 0); assert.deepEqual(out[1].cids, []); assert.deepEqual(out[1].hidden, { kind: "series-only" });
    assert.ok(!JSON.stringify(out[0]).includes("62"));
  });
  it("leaves other series, films and unknown keys as the very same objects", () => {
    const a = cr("tv:3"), b = cr("movie:9", "movie"), c = cr("tv:4");
    const out = holdBackCredits([a, b, c], { ...lines, "movie:9": { kind: "series-only" } });
    assert.equal(out[0], a); assert.equal(out[1], b); assert.equal(out[2], c);
  });
});

describe("maskCreditItem / isWatchingSeries / heldHit", () => {
  it("drops the run-giving fields only for a Watching series", () => {
    const it = { key: "tv:1", eps: 3, since: "2011", cids: ["x"], role: "A" };
    assert.deepEqual(maskCreditItem(it, "watching"), { key: "tv:1", eps: undefined, since: undefined, cids: undefined, role: "A" });
    for (const s of ["watched", "partial", "watchlist", undefined]) assert.equal(maskCreditItem(it, s), it);
    const film = { key: "movie:1", eps: 0, since: undefined };
    assert.equal(maskCreditItem(film, "watching"), film);
  });
  it("only a series can be held", () => {
    assert.equal(isWatchingSeries("tv:1", "watching"), true);
    assert.equal(isWatchingSeries("movie:1", "watching"), false);
    assert.equal(heldHit({ key: "tv:1" }, { status: "watched" }), false);
    assert.equal(heldHit({ key: "tv:1" }, undefined), false);
  });
});
