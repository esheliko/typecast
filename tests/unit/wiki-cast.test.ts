import { test } from "node:test";
import assert from "node:assert/strict";
import { pageIsSeason, parseWikiCameos, parseWikiCast, plainWiki } from "../../src/lib/wiki-cast";

const PAGE = `''' is the eighth episode of the [[Season 3|third season]] of ''[[The Rookie]]''.
==Summary==
Something with Wesley.
==Cast==
===Main===

*[[Nathan Fillion]] as [[John Nolan]]
*[[Shawn Ashmore]] as [[Wesley Evers]]
===Guest starring===
*[[Michael Beach]] as [[Percy West|Commander Percy West]]
*Toks Olagundoye as Professor [[Fiona Ryan]]
=== Co-starring ===

* Will Westwater as Man Bun<ref>x</ref>
* Will Westwater as Man Bun

== Trivia ==
*Not a cast member as anyone
`;

test("parseWikiCast reads every sub-section of the Cast heading and stops at the next", () => {
  assert.deepEqual(parseWikiCast(PAGE), [
    { name: "Nathan Fillion", role: "John Nolan" },
    { name: "Shawn Ashmore", role: "Wesley Evers" },
    { name: "Michael Beach", role: "Commander Percy West" },
    { name: "Toks Olagundoye", role: "Professor Fiona Ryan" },
    { name: "Will Westwater", role: "Man Bun" },
  ]);
});

test("parseWikiCast is empty without a Cast section", () => {
  assert.deepEqual(parseWikiCast("==Summary==\n*[[A B]] as C"), []);
});

test("plainWiki strips links, refs, templates and bold", () => {
  assert.equal(plainWiki("'''[[A|B]]''' {{x}}<ref>r</ref> [[C]]"), "B C");
});

test("pageIsSeason accepts numbers and ordinals and rejects other seasons", () => {
  assert.ok(pageIsSeason(PAGE, 3));
  assert.ok(pageIsSeason("the [[Season 3]] episode", 3));
  assert.ok(!pageIsSeason(PAGE, 2));
  assert.ok(!pageIsSeason("season 33", 3));
});

test("parseWikiCameos finds an uncredited cameo named in Trivia, and ignores plain parentheses", () => {
  const w = "==Trivia==\n*Captain [[Zoe Andersen]] ([[Mercedes Mason]]) makes an uncredited appearance delivering a speech.\n*Pilot (see [[Pilot]]) airs (2018).\n";
  assert.deepEqual(parseWikiCameos(w), [{ name: "Mercedes Mason", role: "Captain Zoe Andersen" }]);
});
