import { test } from "node:test";
import assert from "node:assert/strict";
import { basedOnPhrase, bestSentences, keywords, parseSections, sentences } from "../../src/lib/wiki-text";

const ARTICLE = `Heatwave is a 2031 American crime film directed by J. Doe. It is loosely based on the 1971 robbery of the Union Bank in St. Louis.
== Plot ==
Detective Sam Reyes tracks a crew of thieves. In the end, Reyes is revealed to be the inside man and escapes to Mexico.
== Production ==
=== Casting ===
Lee Park was originally cast as Reyes but dropped out after two weeks; Ana Cruz replaced him.
=== Filming ===
Principal photography took place in Chicago and at Pinewood Studios over 54 days. The bank scenes were shot in a real vault in Toronto.
== Music ==
The score was composed by Mira Holt, and the film features the song "Low Tide" by The Vents.
== References ==
Chicago Tribune (2031). Filming in Chicago.`;

const secs = parseSections(ARTICLE);

test("splits sections and keeps parent names on sub-sections", () => {
  assert.deepEqual(secs.map((s) => s.name), ["Summary", "Plot", "Production / Casting", "Production / Filming", "Music", "References"]);
});

test("sentences survive abbreviations and initials", () => {
  assert.deepEqual(sentences("Directed by J. Doe in St. Louis for $1.5 million. It opened in May to strong reviews."), [
    "Directed by J. Doe in St. Louis for $1.5 million.", "It opened in May to strong reviews.",
  ]);
});

test("keywords drop small words and stem", () => {
  assert.deepEqual(keywords("Where was it filmed?"), ["film"]);
});

test("finds the best sentence for a question, never from plot (unless spoilers) or references", () => {
  const where = bestSentences(secs, "where was it filmed", { min: 1 });
  assert.ok(where.length >= 1);
  assert.match(where[0].text, /Principal photography took place in Chicago/);
  assert.ok(where.every((f) => f.section !== "References"));
  assert.deepEqual(bestSentences(secs, "inside man Mexico", { min: 1 }), []);
  assert.match(bestSentences(secs, "inside man Mexico", { min: 1, spoilers: true })[0].text, /inside man/);
  assert.match(bestSentences(secs, "who was originally cast", { min: 1 })[0].text, /Lee Park/);
});

test("reads a based-on phrase from the lead", () => {
  assert.equal(basedOnPhrase(secs), "loosely based on the 1971 robbery of the Union Bank in St. Louis");
  assert.equal(basedOnPhrase(parseSections("Foo is a film. == Plot ==\nStuff.")), null);
});
