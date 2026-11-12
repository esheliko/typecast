import { test } from "node:test";
import assert from "node:assert/strict";
import { isOldTitle } from "../../src/lib/then-photo";

test("old enough", () => { assert.equal(isOldTitle("1981-06-12", 2026), true); assert.equal(isOldTitle("2018-01-01", 2026), true); });
test("recent", () => { assert.equal(isOldTitle("2020-05-01", 2026), false); assert.equal(isOldTitle("2026-01-01", 2026), false); });
test("unreadable", () => { assert.equal(isOldTitle("", 2026), false); assert.equal(isOldTitle(undefined, 2026), false); assert.equal(isOldTitle("abcd", 2026), false); });

import { sameImageUrl, dHash, hashDistance, pickThenUrl } from "../../src/lib/then-photo";

test("same picture by address", () => {
  assert.equal(sameImageUrl("https://image.tmdb.org/t/p/w185/abcdef123456.jpg", "https://image.tmdb.org/t/p/original/abcdef123456.jpg"), true);
  assert.equal(sameImageUrl("https://a/x.jpg", "https://a/x.jpg"), true);
  assert.equal(sameImageUrl("https://image.tmdb.org/t/p/w185/abcdef123456.jpg", "https://example.com/other-photo.jpg"), false);
});
test("dHash and distance", () => {
  const row = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const g = Array.from({ length: 8 }, () => row).flat();
  assert.equal(dHash(g), "0".repeat(64));
  assert.equal(hashDistance(dHash(g), "1".repeat(64)), 64);
});
test("pickThenUrl skips the Now photo by address and by look, never returns it", async () => {
  const now = "https://image.tmdb.org/t/p/w185/nownownow1.jpg";
  const hashes: Record<string, string> = { [now]: "0".repeat(64), "https://x/dup.jpg": "0".repeat(60) + "1111", "https://x/other.jpg": "1".repeat(64) };
  const hashOf = async (u: string) => hashes[u] ?? null;
  assert.equal(await pickThenUrl(["https://image.tmdb.org/t/p/w500/nownownow1.jpg", "https://x/dup.jpg", "https://x/other.jpg"], now, hashOf), "https://x/other.jpg");
  assert.equal(await pickThenUrl(["https://x/dup.jpg"], now, hashOf), null);
  // unreadable pixels: only the address check applies
  assert.equal(await pickThenUrl(["https://x/unknown.jpg"], now, async () => null), "https://x/unknown.jpg");
});

import { thenScore, rankThenImages, isGenericRole } from "../../src/lib/then-photo";

const who = { actor: "Nathan Fillion", char: "John Nolan", title: "The Rookie" };
const headshot = { thumb: "https://m.media-amazon.com/a.jpg", page: "https://www.imdb.com/name/nm0277213/", title: "Nathan Fillion - IMDb", w: 500, h: 750 };
const scene = { thumb: "https://static.wikia.nocookie.net/b.jpg", page: "https://therookie.fandom.com/wiki/John_Nolan", title: "John Nolan | The Rookie Wiki", w: 1280, h: 720 };
const event = { thumb: "https://x/c.jpg", page: "https://www.gettyimages.com/detail/1", title: "Nathan Fillion attends the premiere", w: 800, h: 1200 };
const still = { thumb: "https://x/d.jpg", page: "https://www.tvline.com/the-rookie-season-5", title: "The Rookie season 5 episode: Nathan Fillion as John Nolan", w: 1000, h: 560 };

test("headshots and event photos score below stills", () => {
  assert.ok(thenScore(headshot, who) < 0);
  assert.ok(thenScore(event, who) < 0);
  assert.ok(thenScore(scene, who) > 0);
  assert.ok(thenScore(still, who) > thenScore(scene, who));
});
test("ranking puts the role picture first and drops lookalike headshots", () => {
  const r = rankThenImages([headshot, event, scene, still], who);
  assert.deepEqual(r.map((x) => x.thumb), [still.thumb, scene.thumb]);
});
test("ranking keeps the search order for ties and handles missing fields", () => {
  const a = { thumb: "https://x/1.jpg", title: "John Nolan" }, b = { thumb: "https://x/2.jpg", title: "John Nolan" };
  assert.deepEqual(rankThenImages([a, b], who).map((x) => x.thumb), [a.thumb, b.thumb]);
});

test("strict pick skips a candidate whose pixels cannot be read, and re-hosted copies of the Now photo", async () => {
  const now = "https://image.tmdb.org/t/p/w185/aaaaaaaaaaaa.jpg";
  const hashes: Record<string, string | null> = { [now]: "0".repeat(64), "https://x/copy.jpg": "0".repeat(10) + "1".repeat(8) + "0".repeat(46), "https://x/unreadable.jpg": null, "https://x/other.jpg": "1".repeat(64) };
  const hashOf = async (u: string) => hashes[u] ?? null;
  const c = ["https://x/copy.jpg", "https://x/unreadable.jpg", "https://x/other.jpg"];
  assert.equal(await pickThenUrl(c, now, hashOf, 6, true), "https://x/other.jpg");
  assert.equal(await pickThenUrl(c.slice(0, 2), now, hashOf, 6, true), null);
  assert.equal(await pickThenUrl(c.slice(1, 2), now, hashOf), "https://x/unreadable.jpg"); // lenient mode keeps the old behaviour
});

// Real Serper rows (checked live): the first hit was IMDb's own headshot, the role pictures came after it.
test("real results: IMDb character page beats the headshot and the TVmaze thumbnail", () => {
  const w = { actor: "Tamyra Gray", char: "3Eyez", title: "The Rookie" };
  const head = { thumb: "h", page: "https://www.imdb.com/name/nm1223951/", title: "Tamyra Gray - IMDb", w: 1000, h: 1455 };
  const role = { thumb: "r", page: "https://www.imdb.com/title/tt7587890/characters/nm1223951/", title: "The Rookie (TV Series 2018– ) - Tamyra Gray as 3Eyez - IMDb", w: 380, h: 214 };
  const tvm = { thumb: "t", page: "https://www.tvmaze.com/characters/855231/the-rookie-3eyez", title: "3Eyez - The Rookie | TVmaze", w: 210, h: 295 };
  assert.deepEqual(rankThenImages([head, tvm, role], w).map((x) => x.thumb), ["r", "t"]);
});
test("real results: an actor's own wiki page is a portrait, a generic title gallery ranks below the actor's tagged page", () => {
  const w = { actor: "Melissa O'Neil", char: "Lucy Chen", title: "The Rookie" };
  const wiki = { thumb: "w", page: "https://the-rookie.fandom.com/wiki/Melissa_O%27Neil", title: "Melissa O'Neil | The Rookie Wiki | Fandom", w: 438, h: 600 };
  const art = { thumb: "a", page: "https://collider.com/the-rookie-season-8-melissa-oneil-lucy-training/", title: "'The Rookie' Season 8's Unexpected Lucy Training", w: 1600, h: 900 };
  assert.ok(thenScore(art, w) > thenScore(wiki, w));
  const w2 = { actor: "Lisa Arturo", char: "Cindy", title: "American Pie 2" };
  const gal = { thumb: "g", page: "https://www.imdb.com/title/tt0252866/mediaviewer/rm3535959808/", title: "American Pie 2 (2001)", w: 1437, h: 783 };
  const tag = { thumb: "c", page: "https://www.imdb.com/title/tt0252866/characters/nm0037970/", title: "American Pie 2 (2001) - Lisa Arturo as Amber - IMDb", w: 1439, h: 779 };
  assert.ok(thenScore(tag, w2) >= thenScore(gal, w2));
});

test("a picture with no tie to the role (another film's poster) is never a Then photo, even when nothing better is left", () => {
  const w = { actor: "Tamyra Gray", char: "3Eyez", title: "The Rookie" };
  const vq = { thumb: "https://x/vq.jpg", page: "https://www.example.com/film/visionquest", title: "Vision Quest poster", w: 500, h: 1000 };
  const role = { thumb: "r", page: "https://www.imdb.com/title/tt13433318/characters/nm1223951/", title: "The Rookie Bad Blood - Tamyra Gray as 3Eyez - IMDb", w: 1263, h: 1121 };
  const poster = { thumb: "p", page: "https://live-action.fandom.com/wiki/The_Rookie_(2018)", title: "The Rookie (2018) | Live Action Wiki | Fandom", w: 780, h: 1170 };
  assert.deepEqual(rankThenImages([vq], w), []);
  const montage = { thumb: "m", page: "https://www.example.com/tamyra-gray-movies-and-tv-shows-the-rookie", title: "Tamyra Gray movies and TV: The Rookie, VisionQuest", w: 900, h: 900 };
  const scene = { thumb: "s", page: "https://www.tvline.com/the-rookie-season-4", title: "The Rookie season 4 episode 8", w: 1000, h: 560 };
  assert.deepEqual(rankThenImages([vq, poster, montage, scene, role], w).map((x) => x.thumb), ["r"]); // a scene naming only the show could be anyone in it
  const named = { thumb: "n", page: "https://www.tvline.com/the-rookie-season-4", title: "The Rookie season 4: Tamyra Gray episode 8", w: 1000, h: 560 };
  assert.deepEqual(rankThenImages([scene, named, role], w).map((x) => x.thumb), ["r", "n"]);
  assert.ok(thenScore(role, w) > thenScore(poster, w));
});

test("real case: IMDb's tagged page also serves a tall 'known for' poster collage under the same title; only its landscape stills count", () => {
  const w = { actor: "Tamyra Gray", char: "3Eyez", title: "The Rookie" };
  const page = "https://www.imdb.com/title/tt7587890/characters/nm1223951/", title = "The Rookie (TV Series 2018– ) - Tamyra Gray as 3Eyez - IMDb";
  const collage = { thumb: "c", page, title, w: 1000, h: 1250 }, still = { thumb: "s", page, title, w: 380, h: 214 }, art = { thumb: "a", page, title, w: 1350, h: 1688 };
  assert.deepEqual(rankThenImages([collage, art, still], w).map((x) => x.thumb), ["s"]);
});

test("a generic role ('Kidnapper 1') is not evidence: another man's scene from the same show must not become Then", () => {
  assert.ok(isGenericRole("Kidnapper 1") && isGenericRole("Sketchy Guest") && !isGenericRole("Lucy Chen"));
  const w = { actor: "Dusty Sorg", char: "Kidnapper 1", title: "Westworld" };
  const other = { thumb: "o", page: "https://www.example.com/westworld-kidnapper-scene", title: "Westworld kidnapper crime scene", w: 1200, h: 700 };
  const mine = { thumb: "m", page: "https://www.example.com/westworld-s2", title: "Dusty Sorg in Westworld", w: 1200, h: 700 };
  assert.deepEqual(rankThenImages([other, mine], w).map((x) => x.thumb), ["m"]);
});
