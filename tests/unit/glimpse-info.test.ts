import { test } from "node:test";
import assert from "node:assert/strict";
import { fandomNote, pickFandomPage, characterBlurb, minorRole, introFromHtml, clipEps, clipSeasons, firstSentences, lifeFacts, presenceLine, safeBio } from "../../src/lib/glimpse-info";
import { parseSections } from "../../src/lib/wiki-text";

/* eslint-disable @typescript-eslint/no-explicit-any */
const expect = (v: any) => ({
  toEqual: (x: unknown) => assert.deepEqual(v, x), toBe: (x: unknown) => assert.equal(v, x), toHaveLength: (n: number) => assert.equal(v.length, n),
  toMatch: (r: RegExp) => assert.match(v, r), toBeNull: () => assert.equal(v, null), toBeUndefined: () => assert.equal(v, undefined),
  toBeLessThanOrEqual: (n: number) => assert.ok(v <= n), toMatchObject: (o: Record<string, unknown>) => { for (const k of Object.keys(o)) assert.deepEqual(v[k], o[k]); },
  not: { toMatch: (r: RegExp) => assert.doesNotMatch(v, r) },
});


const eps = [{ s: 1, e: 1 }, { s: 1, e: 2 }, { s: 2, e: 1 }, { s: 2, e: 9 }, { s: 3, e: 1 }];

// clipEps / clipSeasons
  test("no position keeps everything", () => { expect(clipEps(eps, null)).toHaveLength(5); expect(clipSeasons([1, 2, 3], null)).toEqual([1, 2, 3]); });
  test("exact position stops at the episode", () => expect(clipEps(eps, { s: 2, e: 8 })).toEqual([{ s: 1, e: 1 }, { s: 1, e: 2 }, { s: 2, e: 1 }]));
  test("season only includes that whole season", () => expect(clipEps(eps, { s: 2, e: null })).toHaveLength(4));
  test("season not set is the whole series", () => expect(clipEps(eps, { s: null, e: null })).toHaveLength(5));
  test("seasons stop at the position", () => { expect(clipSeasons([1, 2, 3], { s: 2, e: 8 })).toEqual([1, 2]); expect(clipSeasons([0, 1], { s: 0, e: null })).toEqual([0]); });

// safeBio
  const bio = "Sara Rue is an American actress. She played Nell Forester on The Rookie for three seasons. She also starred in Rules of Engagement. Born in New York, she studied acting.";
  test("keeps the first sentences normally", () => expect(safeBio(bio)).toBe(bio));
  test("drops sentences about the watched show and about seasons while No spoilers is on", () => {
    const out = safeBio(bio, { nospoil: true, hide: "The Rookie" });
    expect(out).not.toMatch(/Rookie|seasons/);
    expect(out).toMatch(/American actress/);
  });
  test("is short while No spoilers is on", () => expect(safeBio(bio, { nospoil: true }).split(". ").length).toBeLessThanOrEqual(2));
  test("empty in, empty out", () => expect(safeBio("")).toBe(""));

const article = parseSections([
  "A crime drama about a teacher turned cook.", "", "== Cast and characters ==",
  "=== Main ===",
  "Bryan Cranston as Walter White: A high school chemistry teacher who is diagnosed with cancer and starts to cook methamphetamine. He later builds an empire and loses his family.",
  "Anna Gunn as Skyler White: Walter's wife, who becomes suspicious of his behaviour. She eventually helps him launder money.",
  "== Reception ==", "Critics loved it. Bryan Cranston won awards.",
].join("\n"));

// characterBlurb
  test("finds the actor's paragraph and drops the lead-in", () => {
    const b = characterBlurb(article, "Walter White", "Bryan Cranston", 1);
    expect(b?.text).toBe("A high school chemistry teacher who is diagnosed with cancer and starts to cook methamphetamine.");
    expect(b?.section).toMatch(/Cast and characters/);
  });
  test("more sentences when spoilers are allowed", () => expect(characterBlurb(article, "Walter White", "Bryan Cranston", 3)?.text).toMatch(/empire/));
  test("works from the character alone", () => expect(characterBlurb(article, "Skyler White", "Someone Else", 1)?.text).toMatch(/wife/));
  test("ignores sections that are not about the cast", () => expect(characterBlurb(article, "Nobody", "Bryan Cranston", 1)?.section).toMatch(/Cast/));
  test("null when nothing matches", () => expect(characterBlurb(article, "Jesse Pinkman", "Aaron Paul", 1)).toBeNull());
  test("a sub-section named after the character is used", () => {
    const secs = parseSections(["Intro.", "== Characters ==", "=== Nell Forester ===", "Nell is a sharp-tongued nurse who joins the team in the pilot episode."].join("\n"));
    expect(characterBlurb(secs, "Nell Forester", "Sara Rue", 1)?.text).toMatch(/sharp-tongued/);
  });

  test("a minor part found by surname under another first name and role name", () => {
    const secs = parseSections(["Intro.", "== Cast ==", "Also appearing are Hy Pyke as Taffey Lewis, Robert Okazaki as Howie Lee, and Kimiko Hiroshige as the cityspeak announcer."].join("\n"));
    expect(characterBlurb(secs, "Sushi Master", "Bob Okazaki", 1)).toBeNull();
    expect(minorRole(secs, "Bob Okazaki")?.text).toBe("Robert Okazaki as Howie Lee.");
    expect(minorRole(secs, "Bob Okazaki")?.role).toBe("Howie Lee");
    expect(minorRole(secs, "Nobody Else")).toBeNull();
  });

// presenceLine / lifeFacts / firstSentences
  const e = [{ s: 1, e: 1, name: "a", air: "2011-10-09" }, { s: 2, e: 3, name: "b", air: "2012-11-12" }];
  test("counts, seasons and dates", () => expect(presenceLine({ episodes: e, seasons: [1, 2], total: 2 })).toBe("2 episodes · Seasons 1–2 · first 9 Oct 2011, latest 12 Nov 2012"));
  test("says so when cut at the position", () => expect(presenceLine({ episodes: e, seasons: [1, 2], total: 0 }, "S2 E3")).toMatch(/^Up to S2 E3: 2 episodes .*latest so far/));
  test("a regular listed by season only", () => expect(presenceLine({ episodes: [], seasons: [1, 2, 3], total: 60 })).toBe("About 60 episodes · Seasons 1–3"));
  test("life", () => { expect(lifeFacts({ birthday: "1970-03-03", deathday: "", place: "London" }, 54)).toBe("Born 3 Mar 1970 in London · 54 years old"); expect(lifeFacts({ birthday: "", deathday: "", place: "" }, null)).toBe(""); });
  test("firstSentences falls back to a cut", () => expect(firstSentences("short bit", 2)).toBe("short bit"));

const FAN = "Walter Hartwell White is the main protagonist of Breaking Bad. He is a high school chemistry teacher in Albuquerque. In season 5 he dies after a shootout. He builds a drug empire.";
test("fandomNote: safe keeps one sentence with no story in it", () => {
  expect(fandomNote(FAN, "Walter White", { safe: true })).toBe("Walter Hartwell White is the main protagonist of Breaking Bad.");
  expect(fandomNote("Walter White dies in the finale. He is later revealed to be alive.", "Walter White", { safe: true })).toBeNull();
});
test("fandomNote: fully watched gets the lead as written", () => expect(fandomNote(FAN, "Walter White", { safe: false, max: 3 })).toMatch(/dies after a shootout/));
test("fandomNote: a page about someone else is refused", () => expect(fandomNote("Skyler is a wife and bookkeeper in the show.", "Jesse Pinkman", { safe: false })).toBeNull());
test("pickFandomPage prefers the exact page and skips lists and subpages", () => {
  expect(pickFandomPage(["Walter White/Gallery", "List of Walter White quotes", "Walter White Jr.", "Walter White"], "Walter White")).toBe("Walter White");
  expect(pickFandomPage(["Walter White Jr."], "Walter White")).toBe("Walter White Jr.");
  expect(pickFandomPage(["Season 5", "Category:Characters"], "Walter White")).toBeNull();
});

test("introFromHtml keeps the paragraphs and drops the infobox, figures and footnote marks", () => {
  const html = '<div><aside><h2>Sushi master</h2><p>Born: somewhere far away from here today</p></aside><figure><p>caption caption caption caption</p></figure><p class="x">The <b>sushi master</b> runs a bar&nbsp;in the city.<sup>[1]</sup> He serves Deckard.</p><p></p></div>';
  expect(introFromHtml(html)).toBe("The sushi master runs a bar in the city. He serves Deckard.");
});
test("pickFandomPage accepts a one-letter spelling difference", () => expect(pickFandomPage(["Zuben", "Howey Lee"], "Howie Lee")).toBe("Howey Lee"));
