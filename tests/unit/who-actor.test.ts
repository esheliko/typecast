import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRelation, initials, matchCast, matchCredits, matchEpisodes, nameWindows, near, relatives, splitActorQuery, splitTitleQuery } from "../../src/lib/who-actor";
import type { PCredit } from "../../src/lib/who-types";

const c = (id: number, title: string, role: string, votes = 1): PCredit => ({ key: `movie:${id}`, type: "movie", id, title, year: "2000", poster: null, role, date: "", eps: 0, cids: [], extra: false, votes });
const people = [{ name: "George" }, { name: "George Clooney" }, { name: "Kate Winslet" }];

describe("splitActorQuery", () => {
  it("takes the longest full name and drops filler", () => {
    const r = splitActorQuery("george clooney as criminal", people)!;
    assert.equal(r.person.name, "George Clooney");
    assert.deepEqual(r.rest, ["criminal"]);
    assert.deepEqual(splitActorQuery("Kate Winslet spotless mind", people)!.rest, ["spotless", "mind"]);
  });
  it("needs the whole name", () => assert.equal(splitActorQuery("kate", people), null));
});

describe("matchCredits", () => {
  const list = [c(1, "Eternal Sunshine of the Spotless Mind", "Clementine Kruczynski"), c(2, "Heat", "Convict Joe"), c(3, "Law", "Attorney Pelly", 5)];
  it("matches a title, a character, or a close word for the part", () => {
    assert.deepEqual(matchCredits(list, ["spotless", "mind"]).map((m) => m.credit.id), [1]);
    assert.deepEqual(matchCredits(list, ["criminal"]).map((m) => m.credit.id), [2]);
    assert.deepEqual(matchCredits(list, ["lawyer"]).map((m) => m.credit.id), [3]);
    assert.deepEqual(matchCredits(list, ["clementine"]).map((m) => m.by), ["role"]);
  });
  it("lists their best work with nothing left over", () => assert.equal(matchCredits(list, []).length, 3));
});

describe("matchCredits themes", () => {
  const list = [c(1, "Heat", "Neil McCauley"), c(2, "Up", "Carl")];
  it("matches what a title is about when no character fits, after the solid matches", () => {
    const r = matchCredits(list, ["criminal"], { "movie:1": ["heist", "los angeles"], "movie:2": ["balloon"] });
    assert.deepEqual(r.map((m) => [m.credit.id, m.by]), [[1, "theme"]]);
    assert.deepEqual(matchCredits(list, ["lawyer"], { "movie:2": ["courtroom"] }).map((m) => m.credit.id), [2]);
  });
});

describe("fuzzy", () => {
  it("near: prefixes and small misspellings, not short words", () => {
    assert.ok(near("radcliff", "radcliffe"));
    assert.ok(near("haymitch", "haymitch") && near("haymich", "haymitch") && near("magicion", "magician"));
    assert.equal(near("cat", "cot"), false);
  });
  it("finds the actor anywhere in the text, misspelt", () => {
    const ppl = [{ name: "Woody Harrelson" }, { name: "Daniel Radcliffe" }, { name: "Daniel Day-Lewis" }];
    assert.deepEqual(splitActorQuery("woody harlson magician", ppl)?.rest, ["magician"]);
    const r = splitActorQuery("wizard daniel radcliff", ppl)!;
    assert.equal(r.person.name, "Daniel Radcliffe");
    assert.deepEqual(r.rest, ["wizard"]);
    assert.equal(splitActorQuery("daniel craig", ppl), null);
  });
  it("lists the name windows to ask TMDB about", () => {
    assert.ok(nameWindows("wizard daniel radcliff").includes("daniel radcliff"));
    assert.ok(nameWindows("woody harlson magician").includes("woody"));
  });
  it("title + character: the title leads the text", () => {
    const t = splitTitleQuery("hunger games haymitch", [{ title: "The Hunger Games" }, { title: "Hunger" }])!;
    assert.equal(t.title.title, "The Hunger Games");
    assert.deepEqual(t.rest, ["haymitch"]);
    const cast = [{ id: 1, name: "Woody Harrelson", photo: null, role: "Haymitch Abernathy" }, { id: 2, name: "Jennifer Lawrence", photo: null, role: "Katniss Everdeen" }];
    assert.deepEqual(matchCast(cast, ["haymitch"]).map((x) => x.id), [1]);
    assert.deepEqual(matchCast(cast, ["haymich"]).map((x) => x.id), [1]);
  });
});

describe("one word of a name", () => {
  const ppl = [{ name: "Wizard", popularity: 0.1 }, { name: "Damaine Radcliff", popularity: 0.4 }, { name: "Daniel Radcliffe", popularity: 4.7 }];
  it("a cut-short surname finds the most popular person, either word order", () => {
    for (const q of ["radclif wizard", "wizard radclif"]) {
      const r = splitActorQuery(q, ppl, { partial: true })!;
      assert.equal(r.person.name, "Daniel Radcliffe");
      assert.deepEqual(r.rest, ["wizard"]);
    }
  });
  it("is off unless asked for", () => assert.equal(splitActorQuery("radclif wizard", ppl), null));
  it("searches the shortened word too", () => assert.ok(nameWindows("radcliff").includes("radclif")));
});

describe("title anywhere, cut short, initials", () => {
  const titles = [{ title: "Shameless" }, { title: "The Big Bang Theory", popularity: 77 }, { title: "How I Met Your Mother", popularity: 1684 }, { title: "Big Bang", popularity: 2 }];
  it("a title at the end, in the middle, or cut short", () => {
    assert.deepEqual(splitTitleQuery("kev shameless", titles)?.rest, ["kev"]);
    const r = splitTitleQuery("big bang sheldon mom", titles)!;
    assert.equal(r.title.title, "The Big Bang Theory");
    assert.deepEqual(r.rest, ["sheldon", "mom"]);
  });
  it("initials, and a one-word cut is not enough", () => {
    assert.equal(initials("How I Met Your Mother"), "himym");
    assert.deepEqual(splitTitleQuery("paralegal himym", titles)?.rest, ["paralegal"]);
    assert.equal(splitTitleQuery("bang", [{ title: "The Big Bang Theory" }]), null);
  });
});

describe("relatives and episodes", () => {
  const cast = [
    { id: 1, name: "Jim Parsons", photo: null, role: "Sheldon Cooper", g: 2 },
    { id: 2, name: "Laurie Metcalf", photo: null, role: "Mary Cooper", g: 1 },
    { id: 3, name: "Courtney Henggeler", photo: null, role: "Missy Cooper", g: 1 },
    { id: 4, name: "Kaley Cuoco", photo: null, role: "Penny", g: 1 },
  ];
  const born: Record<number, number> = { 1: 1973, 2: 1955, 3: 1978 };
  it("finds the mother, not the sister, by age", () => {
    const f = findRelation(["sheldon", "mom"])!;
    assert.deepEqual(f.anchor, ["sheldon"]);
    assert.deepEqual(relatives(cast, f.anchor, f.rel, (id) => born[id] ?? null)!.people.map((p) => p.id), [2]);
    assert.deepEqual(relatives(cast, ["sheldon"], findRelation(["sister", "x"])!.rel, (id) => born[id] ?? null)!.people.map((p) => p.id), [3]);
  });
  it("needs someone to be related to", () => assert.equal(findRelation(["mom"]), null));
  it("matches an episode by a close word", () => {
    const eps = [{ name: "The Chinese Restaurant" }, { name: "The Contest" }];
    assert.deepEqual(matchEpisodes(eps, ["asian", "restaurant"]).map((e) => e.name), ["The Chinese Restaurant"]);
  });
});
