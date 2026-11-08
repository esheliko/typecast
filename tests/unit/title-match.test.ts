import test from "node:test";
import assert from "node:assert/strict";
import { baseOf, charSim, isLiteral, normSeq, sameNumbers, score, sim, splitQualifier, startsWithWords, toks, trailingNumber, variants } from "../../src/lib/title-match";
import { parseSuggestion } from "../../src/lib/spell";

test("normSeq ignores case, punctuation, small words and sequel wording", () => {
  assert.equal(normSeq("Spider-Man: Into the Spider-Verse"), normSeq("spider man- into the spider verse"));
  assert.equal(normSeq("Back to the Future Part II"), normSeq("Back to the future 2"));
  assert.equal(normSeq("Guardians of the Galaxy Vol. 3"), normSeq("Guardians of the galaxy 3"));
  assert.equal(normSeq("Doctor Strange in the Multiverse of Madness"), normSeq("Doctor strange multiverse of madness"));
  assert.equal(normSeq("Percy Jackson & the Olympians"), normSeq("Percy Jackson & and the Olympians"));
  assert.equal(normSeq("Ocean's Eleven"), normSeq("Ocean’s 11"));
  assert.equal(normSeq("Five Feet Apart"), normSeq("5 feet apart"));
  assert.equal(normSeq("Furious 7"), normSeq("Furious seven"));
  assert.deepEqual(toks("The Hunger Games: Mockingjay - Part 1"), toks("The hunger games: mockingjay pt. 1"));
});

test("score: same title 3, longer title 2, near miss 1, otherwise 0", () => {
  assert.equal(score(["Deadpool"], "Dead pool"), 3);
  assert.equal(score(["Avatar"], "Avatar 1"), 3);
  assert.equal(score(["Thor: Ragnarok"], "Thor"), 2);
  assert.equal(score(["Glass Onion: A Knives Out Mystery"], "Glass onion knives out"), 2);
  assert.equal(score(["Titan: The OceanGate Submersible Disaster"], "Titan: the oceangate disaster"), 2);
  assert.equal(score(["Tinker Bell and the Pirate Fairy"], "The pirate fairy"), 2);
  assert.equal(score(["Cruella"], "Cruela"), 1);
  assert.equal(score(["The Family Stone"], "The stone family"), 1);
  assert.equal(score(["Avatar"], "Avatar 2"), 0);
  assert.equal(score(["Madagascar"], "Madagascar 3"), 0);
});

test("score: a sequel number picks the numbered title, even with a longer subtitle", () => {
  assert.equal(score(["Spy Kids 3-D: Game Over"], "Spy kids 3"), 3);
  assert.equal(score(["Madagascar 3: Europe's Most Wanted"], "Madagascar 3"), 3);
  assert.equal(score(["Spy Kids 30"], "Spy kids 3"), 0);
  assert.equal(score(["The Hunger Games: Mockingjay - Part 2"], "The hunger games: mockingjay pt. 1"), 0);
});

test("a literal match beats a title that only matches once small words are ignored", () => {
  assert.ok(isLiteral(["Fast & Furious"], "Fast & furious"));
  assert.ok(!isLiteral(["The Fast and the Furious"], "Fast & furious"));
  assert.ok(isLiteral(["The Mask"], "Mask"));
});

test("sim gives no credit to a short title inside a long name", () => {
  assert.ok(sim("Captain America brand new day", "Captain America: Brave New World") > sim("Captain America brand new day", "Captain America"));
  assert.ok(sim("Harry Potter and the sorcerer stone", "Harry Potter and the Philosopher's Stone") > sim("Harry Potter and the sorcerer stone", "Sorcerer"));
  assert.ok(charSim("The boy in stripes", "Stripes") < 0.78);
  assert.ok(charSim("Noting hill", "Notting Hill") >= 0.9);
});

test("sameNumbers stops a retry from landing on another part", () => {
  assert.ok(!sameNumbers("The kissing booth pt. 2", "The Kissing Booth"));
  assert.ok(!sameNumbers("Mockingjay pt. 1", "Mockingjay - Part 2"));
  assert.ok(sameNumbers("Big hero's 6", "Big Hero 6"));
});

test("trailingNumber and baseOf", () => {
  assert.deepEqual(trailingNumber("Dead pool 2"), { base: "Dead pool", n: 2 });
  assert.deepEqual(trailingNumber("Mission: impossible III"), { base: "Mission: impossible", n: 3 });
  assert.deepEqual(trailingNumber("The kissing booth pt. 2"), { base: "The kissing booth", n: 2 });
  assert.deepEqual(trailingNumber("Harry Potter and the deathly hallows: part 1"), { base: "Harry Potter and the deathly hallows", n: 1 });
  assert.equal(trailingNumber("Avatar"), null);
  assert.equal(baseOf("Croods 2"), "Croods");
});

test("variants: run-together words, number words and part words", () => {
  assert.ok(variants("Dead pool").includes("Deadpool"));
  assert.ok(variants("Moon rise kingdom").includes("Moonrise kingdom"));
  assert.ok(variants("5 feet apart").includes("five feet apart"));
  assert.ok(variants("Furious seven").includes("Furious 7"));
  assert.ok(variants("The kissing booth pt. 2").includes("The kissing booth 2"));
  assert.ok(!variants("Avatar 2").some((v) => /two/i.test(v)));
  assert.ok(variants("Heat").length === 0);
});

test("splitQualifier: live action means the newest film of the name", () => {
  assert.deepEqual(splitQualifier("How to train your dragon live action"), { name: "How to train your dragon", newest: true });
  assert.deepEqual(splitQualifier("Beauty and the Beast (remake)"), { name: "Beauty and the Beast", newest: true });
  assert.deepEqual(splitQualifier("Live Action"), { name: "Live Action", newest: false });
  assert.deepEqual(splitQualifier("Heat"), { name: "Heat", newest: false });
});

test("startsWithWords", () => {
  assert.ok(startsWithWords("Descendants 2", "Descendants"));
  assert.ok(!startsWithWords("Descendants", "Descendants"));
  assert.ok(!startsWithWords("Descendants of the Sun", "Descent"));
});

test("parseSuggestion reads Wikipedia's answer and tolerates anything else", () => {
  assert.equal(parseSuggestion({ query: { searchinfo: { suggestion: "pleasantville" } } }), "pleasantville");
  assert.equal(parseSuggestion({ query: { searchinfo: {} } }), null);
  assert.equal(parseSuggestion(null), null);
  assert.equal(parseSuggestion({ query: { searchinfo: { suggestion: "  " } } }), null);
});
