import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPeople, parseQuestion, norm } from "../../src/lib/ask-intent";

const cast = [
  { id: 1, name: "Bryan Cranston", role: "Walter White" },
  { id: 2, name: "Aaron Paul", role: "Jesse Pinkman" },
  { id: 3, name: "Anna Gunn", role: "Skyler White" },
  { id: 4, name: "RJ Mitte", role: "Walter White Jr." },
  { id: 5, name: "Dean Norris", role: "Hank Schrader" },
  { id: 6, name: "Giancarlo Esposito", role: "Gustavo Fring / Gus (voice)" },
];

test("norm drops accents, punctuation and possessives", () => {
  assert.equal(norm("Hank’s wife — Marie?"), "hank wife marie");
  assert.equal(norm("Penélope Cruz"), "penelope cruz");
});

test("matches actors and characters, full and partial, in question order", () => {
  assert.deepEqual(matchPeople("where do I know Jesse from", cast), [2]);
  assert.deepEqual(matchPeople("have Hank and walter worked together", cast), [5, 1]);
  assert.deepEqual(matchPeople("Skyler White", cast), [3]);
  assert.deepEqual(matchPeople("who plays Walter White Jr", cast), [4]);
  assert.deepEqual(matchPeople("is Gus in anything else", cast), [6]);
  assert.deepEqual(matchPeople("bryan cranston's other roles", cast), [1]);
  assert.deepEqual(matchPeople("who is the guy in the hat", cast), []);
});

test("classifies questions", () => {
  const k = (q: string, last: number[] = []) => parseQuestion(q, cast, last);
  assert.deepEqual(k("Where do I know Jesse from?"), { kind: "who", people: [2] });
  assert.deepEqual(k("Pinkman"), { kind: "who", people: [2] });
  assert.deepEqual(k("what else has Aaron Paul been in"), { kind: "credits", people: [2] });
  assert.deepEqual(k("and what else was he in?", [5]), { kind: "credits", people: [5] });
  assert.deepEqual(k("have Hank and Walter worked together before?"), { kind: "together", people: [5, 1] });
  assert.deepEqual(k("Which of the cast have worked together before?"), { kind: "castLinks" });
  assert.deepEqual(k("how old is Bryan Cranston"), { kind: "age", people: [1] });
  assert.deepEqual(k("Who directed this?"), { kind: "crew", role: "director" });
  assert.deepEqual(k("who did the music"), { kind: "crew", role: "composer" });
  assert.deepEqual(k("Is there a post-credits scene?"), { kind: "stinger" });
  assert.deepEqual(k("Is this based on a true story?"), { kind: "truth" });
  assert.deepEqual(k("where was it filmed"), { kind: "filmed" });
  assert.deepEqual(k("Recap the story so far"), { kind: "recap" });
  assert.deepEqual(k("how many episodes are left this season"), { kind: "length" });
  assert.deepEqual(k("what song is this"), { kind: "song" });
  assert.deepEqual(k("any cast in common with Better Call Saul"), { kind: "common", other: "better call saul" });
  assert.deepEqual(k("Did it win any Oscars?"), { kind: "awards" });
  assert.deepEqual(k("what was the budget"), { kind: "money" });
  assert.deepEqual(k("Tell me some trivia (no spoilers)"), { kind: "trivia" });
  assert.deepEqual(k("who is Jonathan Banks"), { kind: "person", q: "jonathan banks" });
  assert.deepEqual(k("Jonathan Banks"), { kind: "person", q: "jonathan banks" });
  assert.equal(k("why is the sky so yellow in Mexico scenes").kind, "search");
});
