import { test } from "node:test";
import assert from "node:assert/strict";
import { castSpec, charOf, creditSpec, infoQuery, personInTitleSpec, personSpec, scopeSpec, titleSpec } from "../../src/lib/glimpse";

/* eslint-disable @typescript-eslint/no-explicit-any */
const expect = (v: any) => ({
  toEqual: (x: unknown) => assert.deepEqual(v, x), toBe: (x: unknown) => assert.equal(v, x), toHaveLength: (n: number) => assert.equal(v.length, n),
  toMatch: (r: RegExp) => assert.match(v, r), toBeNull: () => assert.equal(v, null), toBeUndefined: () => assert.equal(v, undefined),
  toBeLessThanOrEqual: (n: number) => assert.ok(v <= n), toMatchObject: (o: Record<string, unknown>) => { for (const k of Object.keys(o)) assert.deepEqual(v[k], o[k]); },
  not: { toMatch: (r: RegExp) => assert.doesNotMatch(v, r) },
});


const show = { title: "The Rookie", year: "2018", type: "tv", key: "tv:79744" };

// glimpse specs carry what the About part needs
  test("title only", () => expect(titleSpec(show).info).toEqual({ key: "tv:79744" }));
  test("builds the key from id and type when there is no key", () => expect(titleSpec({ title: "Heat", type: "movie", id: 949 }).info).toEqual({ key: "movie:949" }));
  test("accepts the URL form of a key", () => expect(titleSpec({ ...show, key: "tv-79744" }).info?.key).toBe("tv:79744"));
  test("person only", () => expect(personSpec("Sara Rue", "Acting", 123).info).toEqual({ pid: 123 }));
  test("no ids, no info (the panel then shows images only)", () => { expect(personSpec("Sara Rue").info).toBeUndefined(); expect(titleSpec({ title: "x", type: "movie" }).info).toBeUndefined(); });
  test("actor in a title with a character", () => {
    const s = creditSpec("Sara Rue", "Nell (voice) / Dr. Sawyer", show, 123);
    expect(s.info).toEqual({ pid: 123, key: "tv:79744", char: "Nell" });
    expect(s.tabs[0].label).toBe("Nell");
  });
  test("actor in a title with no character still asks for both", () => expect(creditSpec("Sara Rue", "", show, 123).info).toEqual({ pid: 123, key: "tv:79744" }));
  test("cast row and person page agree", () => {
    expect(castSpec("Sara Rue", "Nell", show, undefined, 123).info).toEqual({ pid: 123, key: "tv:79744", char: "Nell" });
    expect(personInTitleSpec("Sara Rue", "Acting", show, 123).info).toEqual({ pid: 123, key: "tv:79744" });
  });
  test("charOf", () => expect(charOf("Nell (voice) / Dr. Sawyer")).toBe("Nell"));

// scopeSpec applies the Watching-now spoiler rules
  const w = { key: "tv:79744", title: "The Rookie", clip: { s: 2, e: 8 }, spoilers: false };
  test("leaves the spec alone while spoilers are allowed", () => { const s = creditSpec("A", "B", show, 1); expect(scopeSpec(s, { ...w, spoilers: true })).toBe(s); });
  test("cuts the watched show at the position", () => expect(scopeSpec(creditSpec("A", "B", show, 1), w).info).toMatchObject({ nospoil: true, hide: "The Rookie", clip: { s: 2, e: 8 } }));
  test("another title gets no cut but still the short form", () => {
    const i = scopeSpec(creditSpec("A", "B", { ...show, key: "tv:1" }, 1), w).info!;
    expect(i.clip).toBeUndefined(); expect(i.nospoil).toBe(true);
  });
  test("a film being watched has no clip", () => expect(scopeSpec(personSpec("A", "Acting", 1), { ...w, clip: null }).info).toMatchObject({ nospoil: true }));
  test("specs without ids are untouched", () => { const s = personSpec("A"); expect(scopeSpec(s, w)).toBe(s); });
  test("infoQuery is stable and carries the cut", () => {
    expect(infoQuery({ key: "tv:1", pid: 2, char: "Nell", clip: { s: 2, e: 8 }, nospoil: true, hide: "X" })).toBe("k=tv%3A1&p=2&ch=Nell&c=1&s=2&e=8&ns=1&h=X");
    expect(infoQuery({ key: "tv:1", clip: { s: null, e: null } })).toBe("k=tv%3A1&c=1");
  });
