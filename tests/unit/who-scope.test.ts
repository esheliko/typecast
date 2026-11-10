import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAllRoster, buildRoster, byGender, groupWhoFaces, guestsOnly, inScope, matchFaces, posFromParams, posLabel, scopeKind, scopeNote, episodesLabel } from "../../src/lib/who-scope";
import type { SeasonData, SeasonPerson, WhoFace } from "../../src/lib/who-types";

const P = (id: number, name: string, g: 0 | 1 | 2 | 3 = 1, role = ""): SeasonPerson => ({ id, name, photo: null, g, role });
const agg = (id: number, name: string, total: number, g: 0 | 1 | 2 | 3 = 1, role = "") => ({ ...P(id, name, g, role), total, cids: [`cid${id}`] });

/** A show: season 1 (guest Ann twice, Bo once), season 2 (regular Rex; guests Nell in E3, Cy in E5, Dee in E9). */
const s1: SeasonData = { n: 1, air: "2018-10-16", episodes: [], regulars: [], agg: [agg(1, "Ann", 2, 1, "Aunt"), agg(2, "Bo", 1, 2, "Boss"), agg(9, "Rex", 20, 2, "Hero")] };
const s2: SeasonData = {
  n: 2, air: "2019-09-29",
  regulars: [P(9, "Rex", 2, "Hero")],
  agg: [agg(9, "Rex", 20, 2), agg(3, "Nell", 1), agg(4, "Cy", 1, 2), agg(5, "Dee", 1)],
  episodes: [
    { e: 1, name: "a", air: "2019-09-29", runtime: 42, still: null, guests: [P(1, "Ann", 1, "Aunt")] },
    { e: 3, name: "c", air: "2019-10-13", runtime: 42, still: null, guests: [{ ...P(3, "Nell", 1, "Nell Forester"), cid: "n1" }] },
    { e: 5, name: "e", air: "2019-10-27", runtime: 42, still: null, guests: [P(4, "Cy", 2, "Cy")] },
    { e: 9, name: "i", air: "2019-12-01", runtime: 42, still: null, guests: [P(5, "Dee", 1, "Dee")] },
  ],
};
const ids = (f: WhoFace[]) => f.map((x) => x.id);

test("scope kinds and labels", () => {
  assert.equal(scopeKind({ s: 2, e: 8 }), "exact");
  assert.equal(scopeKind({ s: 2, e: null }), "season");
  assert.equal(scopeKind({ s: null, e: null }), "all");
  assert.equal(scopeKind(null), null);
  assert.equal(posLabel({ s: 2, e: 8 }), "S2 E8");
  assert.equal(posLabel({ s: 0, e: 3 }), "Specials E3");
  assert.equal(posLabel({ s: null, e: null }), "Season not set");
  assert.deepEqual(posFromParams("2", null), { s: 2, e: null });
  assert.deepEqual(posFromParams(null, "5"), { s: null, e: null }, "an episode without a season means nothing");
  assert.match(scopeNote({ s: 2, e: null })!, /Includes all of season 2 because the episode is not set/);
  assert.match(scopeNote({ s: null, e: null })!, /later seasons may appear/i);
  assert.equal(scopeNote({ s: 2, e: 8 }), null);
});

test("inScope: exact stops at the episode, season includes all of it, specials stand alone", () => {
  assert.ok(inScope(1, 20, { s: 2, e: 3 }));
  assert.ok(inScope(2, 3, { s: 2, e: 3 }));
  assert.ok(!inScope(2, 4, { s: 2, e: 3 }));
  assert.ok(!inScope(3, 1, { s: 2, e: 3 }));
  assert.ok(inScope(2, 20, { s: 2, e: null }));
  assert.ok(!inScope(3, 1, { s: 2, e: null }));
  assert.ok(!inScope(0, 1, { s: 2, e: 3 }), "specials are not part of a normal position");
  assert.ok(inScope(0, 2, { s: 0, e: 3 }));
  assert.ok(inScope(9, 9, { s: null, e: null }));
});

test("exact position: a person whose episodes are all after it is absent", () => {
  const faces = buildRoster([s1, s2], { s: 2, e: 4 });
  assert.ok(ids(faces).includes(3), "Nell (E3) is here");
  assert.ok(!ids(faces).includes(4), "Cy (E5) is after S2 E4");
  assert.ok(!ids(faces).includes(5), "Dee (E9) is after S2 E4");
});

test("exact position: groups are this episode, main cast, seen earlier", () => {
  const faces = buildRoster([s1, s2], { s: 2, e: 5 });
  const part = Object.fromEntries(faces.map((f) => [f.id, f.part]));
  assert.equal(part[4], "episode");
  assert.equal(part[9], "main");
  assert.equal(part[3], "earlier");
  assert.equal(part[1], "earlier");
  assert.equal(part[2], "earlier");
  assert.deepEqual(groupWhoFaces(faces, "exact").map((g) => g.label), ["In this episode", "Main cast", "Seen earlier"]);
});

test("seen earlier is ranked by appearances so far, then recency", () => {
  const faces = buildRoster([s1, s2], { s: 2, e: 5 }).filter((f) => f.part === "earlier");
  // Ann: 2 in season 1 + 1 in season 2 = 3, Bo: 1 (season 1), Nell: 1 (season 2 E3)
  assert.deepEqual(ids(faces), [1, 3, 2]);
  assert.equal(faces[0].n, 3);
  assert.equal(episodesLabel(faces[0]), "x3 episodes");
  assert.equal(episodesLabel(faces[1]), "x1 episode");
  assert.equal(episodesLabel({ ...faces[0], part: "main" }), "", "regulars show no count");
});

test("exact position keeps the credit ids and role of every part", () => {
  const nell = buildRoster([s1, s2], { s: 2, e: 5 }).find((f) => f.id === 3)!;
  assert.equal(nell.role, "Nell Forester");
  assert.deepEqual(nell.cids, ["n1"]);
  assert.equal(nell.ls, 2); assert.equal(nell.le, 3);
});

test("season only: everyone in seasons up to it, all of the season, with guests grouped as Guests", () => {
  const faces = buildRoster([s1, s2], { s: 2, e: null });
  assert.deepEqual([...ids(faces)].sort(), [1, 2, 3, 4, 5, 9]);
  assert.ok(ids(faces).includes(5), "Dee (E9) counts because the whole season is included");
  assert.deepEqual(groupWhoFaces(faces, "season").map((g) => g.label), ["Main cast", "Guests"]);
  // And season 1 alone has no season-2 people.
  assert.deepEqual([...ids(buildRoster([s1], { s: 1, e: null }))].sort(), [1, 2, 9]);
});

test("a later season never leaks into an earlier position", () => {
  const s3: SeasonData = { n: 3, air: "2020-01-01", episodes: [], regulars: [], agg: [agg(77, "Later", 5)] };
  assert.ok(!ids(buildRoster([s1, s2, s3], { s: 2, e: 9 })).includes(77));
  assert.ok(ids(buildRoster([s1, s2, s3], { s: 3, e: null })).includes(77));
});

test("unknown season: the whole series, main cast by billing or share of episodes", () => {
  const faces = buildAllRoster([
    { ...agg(1, "Lead", 100, 2), order: 0 }, { ...agg(2, "Sidekick", 90), order: 1 }, { ...agg(3, "Guest", 2), order: 400 }, { ...agg(4, "Recurring", 60, 2), order: 50 },
  ]);
  assert.deepEqual(faces.filter((f) => f.part === "main").map((f) => f.id), [1, 2, 4], "order < 10 or at least half the most episodes");
  assert.equal(faces.find((f) => f.id === 3)!.part, "guest");
});

test("gender filter: Women and Men use TMDB gender, unknown stays under All only", () => {
  const faces: WhoFace[] = [1, 2, 3, 0].map((g, i) => ({ id: i, name: `P${i}`, photo: null, g: g as 0 | 1 | 2 | 3, role: "", part: "guest", n: 1, ls: 1, le: 1, cids: [] }));
  assert.deepEqual(ids(byGender(faces, "f")), [0]);
  assert.deepEqual(ids(byGender(faces, "m")), [1]);
  assert.equal(byGender(faces, "all").length, 4);
  assert.equal(byGender(faces, "f").some((f) => f.g === 0 || f.g === 3), false);
});

test("guests only drops the main cast", () => {
  const faces = buildRoster([s1, s2], { s: 2, e: 5 });
  assert.ok(!guestsOnly(faces).some((f) => f.part === "main"));
});

test("finder: actor name, character name and any word of the role; name matches first; accents ignored", () => {
  const faces: WhoFace[] = [
    { id: 1, name: "Sara Rue", photo: null, g: 1, role: "Nell Forester (voice)", part: "earlier", n: 1, ls: 1, le: 1, cids: [] },
    { id: 2, name: "Nelly Furtado", photo: null, g: 1, role: "Herself", part: "guest", n: 1, ls: 1, le: 1, cids: [] },
    { id: 3, name: "José Ramón", photo: null, g: 2, role: "Chef Nell", part: "guest", n: 1, ls: 1, le: 1, cids: [] },
  ];
  assert.deepEqual(ids(matchFaces(faces, "nell")), [2, 1, 3], "name match (Nelly) before role matches");
  assert.deepEqual(ids(matchFaces(faces, "forester")), [1]);
  assert.deepEqual(ids(matchFaces(faces, "voice")), [1], "any word of the role");
  assert.deepEqual(ids(matchFaces(faces, "sara rue")), [1]);
  assert.deepEqual(ids(matchFaces(faces, "jose")), [3]);
  assert.deepEqual(ids(matchFaces(faces, "nell forester")), [1], "every word must match");
  assert.deepEqual(ids(matchFaces(faces, "zzz")), []);
  assert.equal(matchFaces(faces, "  ").length, 3);
});

test("the same part with a note ('(voice)') is one role", () => {
  const sd: SeasonData = { n: 1, air: "", regulars: [], episodes: [], agg: [agg(1, "Sara", 3, 1, "Nell Forester / Nell Forester (voice)")] };
  const s2: SeasonData = { n: 2, air: "", regulars: [], episodes: [{ e: 8, name: "", air: "", runtime: null, still: null, guests: [P(1, "Sara", 1, "Nell Forester")] }], agg: [] };
  assert.equal(buildRoster([sd, s2], { s: 2, e: 8 })[0].role, "Nell Forester");
});
