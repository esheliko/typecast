import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appearsLabel, highlight, matchWho, startPos } from "../../src/lib/who-search";
import type { WhoFace } from "../../src/lib/who-types";

const face = (id: number, name: string, role: string, part: WhoFace["part"] = "guest", n = 1): WhoFace => ({ id, name, photo: null, g: 0, role, part, n, ls: 1, le: 1, cids: [] });
const cast = [
  face(1, "Nell Forester", "Dr. Sawyer", "main", 40),
  face(2, "Brent Huff", "Sheriff Dale", "episode", 1),
  face(3, "Ana Paula", "The Waitress", "earlier", 2),
  face(4, "Zoë Hart", "Self", "guest", 3),
];

describe("highlight", () => {
  it("marks words that start with a typed word, ignoring case and accents", () => {
    assert.deepEqual(highlight("Zoë Hart", "zoe"), [{ t: "Zoë", hit: true }, { t: " Hart", hit: false }]);
    assert.deepEqual(highlight("Nell Forester", "for"), [{ t: "Nell ", hit: false }, { t: "For", hit: true }, { t: "ester", hit: false }]);
  });
  it("returns the text untouched with nothing to mark", () => {
    assert.deepEqual(highlight("Brent", ""), [{ t: "Brent", hit: false }]);
    assert.deepEqual(highlight("Brent", "zzz"), [{ t: "Brent", hit: false }]);
  });
});

describe("matchWho", () => {
  it("finds by name and by character, and says which", () => {
    assert.deepEqual(matchWho(cast, "brent").map((m) => [m.face.id, m.by]), [[2, "name"]]);
    assert.deepEqual(matchWho(cast, "sheriff").map((m) => [m.face.id, m.by]), [[2, "role"]]);
  });
  it("needs every word, split across name and role", () => {
    assert.deepEqual(matchWho(cast, "brent sheriff").map((m) => [m.face.id, m.by]), [[2, "both"]]);
    assert.deepEqual(matchWho(cast, "brent waitress"), []);
  });
  it("only searches the people it is given (nobody from a later episode)", () => {
    assert.deepEqual(matchWho(cast.slice(0, 2), "ana"), []);
  });
  it("ignores one letter and empty queries", () => {
    assert.deepEqual(matchWho(cast, "b"), []);
    assert.deepEqual(matchWho(cast, "  "), []);
  });
  it("ranks name before role, then this episode before earlier ones", () => {
    const f = [face(1, "Sam Doe", "Hart", "earlier", 5), face(2, "Hart Lee", "x", "guest", 1), face(3, "Hart Mo", "y", "episode", 1)];
    assert.deepEqual(matchWho(f, "hart").map((m) => m.face.id), [3, 2, 1]);
  });
  it("words a bare 'Self' role", () => {
    assert.equal(matchWho(cast, "zoe")[0].role, "Appears as themselves");
  });
  it("caps the list", () => {
    const many = Array.from({ length: 50 }, (_, i) => face(i, `Ann ${i}`, "x"));
    assert.equal(matchWho(many, "ann", 10).length, 10);
  });
});

describe("appearsLabel", () => {
  it("says main cast, episode counts, or nothing", () => {
    assert.equal(appearsLabel(cast[0]), "Main cast");
    assert.equal(appearsLabel(face(9, "A", "b", "guest", 1)), "1 episode");
    assert.equal(appearsLabel(face(9, "A", "b", "guest", 4)), "4 episodes");
    assert.equal(appearsLabel(face(9, "A", "b", "guest", 0)), "");
  });
});

describe("startPos", () => {
  const seasons = [{ n: 1, eps: 10 }, { n: 2, eps: 8 }];
  it("starts a Watching series at the episode after its saved place", () => {
    assert.deepEqual(startPos("tv", "watching", { s: 1, e: 4 }, seasons), { s: 1, e: 5 });
    assert.deepEqual(startPos("tv", "watching", { s: 1, e: 10 }, seasons), { s: 2, e: 1 });
    assert.deepEqual(startPos("tv", "watching", { s: 2, e: 8 }, seasons), { s: 2, e: 8 });
  });
  it("starts anything else on the whole series, and a film on no place", () => {
    assert.deepEqual(startPos("tv", "watching", null, seasons), { s: null, e: null });
    assert.deepEqual(startPos("tv", "watched", { s: 1, e: 4 }, seasons), { s: null, e: null });
    assert.deepEqual(startPos("tv", undefined, null), { s: null, e: null });
    assert.equal(startPos("movie", "watching", null), null);
  });
});
