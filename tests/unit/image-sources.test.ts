import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanQuery, deadForMs, liveKeys, parseKey, serperKeys, shapeCommons, shapeOpenWeb, shapeProfiles, shapeTagged, shapeTitleImages, wantsPoster } from "../../src/lib/image-sources";

test("title keys", () => {
  assert.deepEqual(parseKey("tv:79744"), { type: "tv", id: 79744 });
  assert.deepEqual(parseKey("movie:603"), { type: "movie", id: 603 });
  for (const bad of ["tv-79744", "tv:", "person:1", "tv:1;x", "", null, undefined]) assert.equal(parseKey(bad as string), null);
});

test("search words are cleaned for Commons", () => {
  assert.equal(cleanQuery("Bryan Cranston actor"), "Bryan Cranston");
  assert.equal(cleanQuery("Greta Gerwig director"), "Greta Gerwig");
  assert.equal(wantsPoster("Heat 1995 film poster"), true);
  assert.equal(wantsPoster("Heat 1995 film scene"), false);
});

test("profiles: best voted first, no duplicates", () => {
  const r = shapeProfiles({ profiles: [{ file_path: "/a.jpg", vote_average: 1 }, { file_path: "/b.jpg", vote_average: 5 }, { file_path: "/b.jpg", vote_average: 5 }, {}] }, "Name");
  assert.deepEqual(r.map((i) => i.full), ["https://image.tmdb.org/t/p/h632/b.jpg", "https://image.tmdb.org/t/p/h632/a.jpg"]);
  assert.equal(r[0].title, "Name");
  assert.deepEqual(shapeProfiles(null, "x"), []);
});

test("tagged: scenes before posters, the asked title first, the title kept for ranking", () => {
  const r = shapeTagged({ results: [
    { file_path: "/p.jpg", image_type: "profile", media_type: "tv", media: { id: 1, name: "X" } },
    { file_path: "/s1.jpg", image_type: "still", media_type: "tv", media: { id: 7, name: "Other Show" } },
    { file_path: "/s2.jpg", image_type: "still", media_type: "movie", media: { id: 9, title: "Wanted Film" } },
    { file_path: "/b1.jpg", image_type: "backdrop", media_type: "movie", media: { id: 9, title: "Wanted Film" } },
    { file_path: "/o.jpg", image_type: "poster", media_type: "movie", media: { id: 9 } },
  ] }, 9);
  assert.deepEqual(r.map((i) => i.full.split("/").pop()), ["s2.jpg", "b1.jpg", "s1.jpg", "o.jpg"]);
  assert.equal(r[0].title, "Wanted Film");
  assert.equal(r[0].page, "https://www.themoviedb.org/movie/9");
  assert.equal(r[2].page, "https://www.themoviedb.org/tv/7");
  // the Then photo must be a scene: no posters
  assert.deepEqual(shapeTagged({ results: [{ file_path: "/o.jpg", image_type: "poster", media_type: "movie", media: { id: 9 } }, { file_path: "/s.jpg", image_type: "still" }] }, 9, false).map((i) => i.full.split("/").pop()), ["s.jpg"]);
  assert.deepEqual(shapeTagged(undefined), []);
});

test("tagged stills are capped at 12", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ file_path: `/${i}.jpg`, image_type: "still", media_type: "tv", media: { id: 1, name: "S" } }));
  assert.equal(shapeTagged({ results: many }).length, 12);
});

test("title images: posters for the Poster tab, backdrops for Scenes", () => {
  const j = { posters: [{ file_path: "/p.jpg", vote_average: 3 }], backdrops: [{ file_path: "/b1.jpg", vote_average: 1 }, { file_path: "/b2.jpg", vote_average: 4 }] };
  assert.deepEqual(shapeTitleImages(j, true, "T", "l").map((i) => i.thumb), ["https://image.tmdb.org/t/p/w342/p.jpg"]);
  assert.deepEqual(shapeTitleImages(j, false, "T", "l").map((i) => i.full.split("/").pop()), ["b2.jpg", "b1.jpg"]);
  assert.deepEqual(shapeTitleImages({}, true, "T", "l"), []);
});

test("Commons: photos only, in the search order, file name as caption", () => {
  const info = (url: string, mime: string) => [{ url, thumburl: `${url}?t`, descriptionurl: `${url}#d`, width: 800, height: 600, mime }];
  const r = shapeCommons({ query: { pages: {
    "11": { title: "File:Second_shot.png", index: 2, imageinfo: info("https://u/2.png", "image/png") },
    "10": { title: "File:First_shot.jpg", index: 1, imageinfo: info("https://u/1.jpg", "image/jpeg") },
    "12": { title: "File:Logo.svg", index: 3, imageinfo: info("https://u/3.svg", "image/svg+xml") },
    "13": { title: "File:Broken.jpg", index: 4 },
  } } });
  assert.deepEqual(r.map((i) => i.title), ["First shot", "Second shot"]);
  assert.equal(r[0].thumb, "https://u/1.jpg?t");
  assert.equal(r[0].page, "https://u/1.jpg#d");
  assert.deepEqual(shapeCommons({}), []);
});

test("Serper keys: both keys, comma lists, no blanks or duplicates", () => {
  assert.deepEqual(serperKeys({ SERPER_API_KEY: "a", SERPER_API_KEY_2: "b" }), ["a", "b"]);
  assert.deepEqual(serperKeys({ SERPER_API_KEY: " a , b ", SERPER_API_KEY_2: "b" }), ["a", "b"]);
  assert.deepEqual(serperKeys({ SERPER_API_KEY_2: "b" }), ["b"]);
  assert.deepEqual(serperKeys({}), []);
});

test("a key is benched only when it is the key's fault", () => {
  assert.equal(deadForMs(400) > 0, true); // out of credits
  assert.equal(deadForMs(403) > 0, true);
  assert.equal(deadForMs(429), 60_000);
  assert.equal(deadForMs(500), 0);
  assert.equal(deadForMs(503), 0);
});

test("benched keys are skipped until their time", () => {
  const dead = new Map([["a", 1000]]);
  assert.deepEqual(liveKeys(["a", "b"], dead, 500), ["b"]);
  assert.deepEqual(liveKeys(["a", "b"], dead, 1000), ["a", "b"]);
  assert.deepEqual(liveKeys([], dead, 0), []);
});

test("OpenWeb Ninja results: thumbnail, page and full size; no empty or non-web addresses", () => {
  const out = shapeOpenWeb({ data: [
    { url: "https://en.wikipedia.org/a.png", thumbnail_url: "https://upload.wikimedia.org/a_t.png", title: "A", width: 194, height: 260, source_url: "https://en.wikipedia.org/wiki/A" },
    { url: "https://x.example/b.jpg", title: "B" },
    { url: "https://x.example/b.jpg", title: "B again" },
    { url: "file:///etc/passwd" },
    { title: "no url" },
  ] });
  assert.deepEqual(out, [
    { thumb: "https://upload.wikimedia.org/a_t.png", full: "https://en.wikipedia.org/a.png", page: "https://en.wikipedia.org/wiki/A", title: "A", w: 194, h: 260 },
    { thumb: "https://x.example/b.jpg", full: "https://x.example/b.jpg", page: "https://x.example/b.jpg", title: "B", w: undefined, h: undefined },
  ]);
  assert.deepEqual(shapeOpenWeb(null), []);
  assert.deepEqual(shapeOpenWeb({}), []);
});
