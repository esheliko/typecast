import { test } from "node:test";
import assert from "node:assert/strict";
import { castSpec, charOf, creditSpec, infoQuery, libraryRoles, personInTitleSpec, personSpec, scopeSpec, tabsWithRoles, titleSpec, withLibRoles } from "../../src/lib/glimpse";

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
  test("spoilers allowed: no No-spoilers rules, but the page's key goes along so other titles stay under their library line", () => {
    const i = scopeSpec(creditSpec("A", "B", show, 1), { ...w, spoilers: true }).info!;
    expect(i).toMatchObject({ pg: "tv-79744", ps: true });
    expect(i.nospoil).toBeUndefined(); expect(i.clip).toBeUndefined(); expect(i.hide).toBeUndefined();
  });
  test("No spoilers on: the page's key goes along without the switch flag", () => { const i = scopeSpec(creditSpec("A", "B", show, 1), w).info!; expect(i.pg).toBe("tv-79744"); expect(i.ps).toBeUndefined(); });
  test("infoQuery carries the page key and its switch (a different page or switch is a different question)", () => {
    const a = infoQuery(scopeSpec(creditSpec("A", "B", show, 1), { ...w, spoilers: true }).info!), b = infoQuery(scopeSpec(creditSpec("A", "B", show, 1), w).info!);
    expect(a).toMatch(/pg=tv-79744/); expect(a).toMatch(/ps=1/); expect(b).toMatch(/pg=tv-79744/); expect(b).not.toMatch(/ps=1/); assert.notEqual(a, b);
  });
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
  test("the cast tab is named after the character, not 'In the role'", () => expect(castSpec("Sara Rue", "Nell", show, undefined, 123).tabs.map((t) => t.label)).toEqual(["Nell", "Sara Rue"]));

  {
    const c = (key: string, role: string, extra = false) => ({ key, type: key.startsWith("tv") ? "tv" as const : "movie" as const, title: `T${key}`, year: "2001", role, extra });
    const lib = new Set(["tv:1", "tv:2", "movie:3", "tv:79744"]);
    test("only library titles, not the current one, not extras or nameless parts", () => {
      const r = libraryRoles([c("tv:79744", "Nell"), c("tv:1", "Ann (voice)"), c("tv:9", "Zed"), c("tv:2", "Self", true), c("movie:3", ""), c("tv:1", "Again")], lib, "tv:79744");
      expect(r.map((x) => [x.key, x.char])).toEqual([["tv:1", "Ann"]]);
    });
    test("capped", () => expect(libraryRoles(Array.from({ length: 20 }, (_, i) => c(`tv:${i}`, "X")), new Set(Array.from({ length: 20 }, (_, i) => `tv:${i}`))).length).toBe(6));
    test("tabs go after the role being looked at and carry their own About", () => {
      const spec = withLibRoles(castSpec("Sara Rue", "Nell", show, undefined, 123), "Sara Rue");
      const tabs = tabsWithRoles(spec, [{ key: "tv:1", type: "tv", title: "Other", year: "2001", char: "Ann" }]);
      expect(tabs.map((t) => t.label)).toEqual(["Nell", "Ann · Other", "Sara Rue"]);
      expect(tabs[1].info).toEqual({ pid: 123, key: "tv:1", char: "Ann" });
      expect(tabs[1].heading).toBe("Sara Rue as Ann · Other");
      expect(tabs[0].heading).toBeUndefined();
      expect(tabs[1].q).toMatch(/Sara Rue as Ann Other/);
    });
    test("no id, no extra tabs", () => expect(withLibRoles(personSpec("A"), "A").libRoles).toBeUndefined());
  }


// Cast face (docs/features/glimpse.md): the face and the small button ask the same question; Show on the cast note adds reveal=1 for that view only.
  test("a cast spec asks with the person, the character and the title, and no reveal", () => {
    const s = castSpec("Mara Quill", "Dr. Ines Vale", { title: "Show", type: "tv", year: "2020", key: "tv:5" } as any, undefined, 9);
    expect(infoQuery(s.info!)).not.toMatch(/reveal/);
    expect(infoQuery({ ...s.info!, reveal: true })).toMatch(/reveal=1/);
    expect(infoQuery(s.info!)).toMatch(/k=tv%3A5/);
  });
