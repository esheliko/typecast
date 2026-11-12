import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryFor, parseGalleryCaptions } from "../../src/lib/wiki-cast";

const wt = `<gallery mode="packed">
File:3x05 001.jpg
File:3x05 002.jpg|Shelly Bhalla as Dr. Melody Etz
File:3x05 011a.jpg|Josh Stewart as [[Graham Porter]]
File:3x05 042.jpg|Brady Smith as \'\'Rico\'\'
</gallery>`;

test("gallery: reads only captioned files and strips markup", () => {
  assert.deepEqual(parseGalleryCaptions(wt), [
    { file: "3x05 002.jpg", caption: "Shelly Bhalla as Dr. Melody Etz" },
    { file: "3x05 011a.jpg", caption: "Josh Stewart as Graham Porter" },
    { file: "3x05 042.jpg", caption: "Brady Smith as Rico" },
  ]);
});
test("gallery: finds pictures captioned with an actor, nobody else's", () => {
  const pics = parseGalleryCaptions(wt);
  assert.deepEqual(galleryFor(pics, "Josh Stewart", "Graham Porter").map((p) => p.file), ["3x05 011a.jpg"]);
  assert.deepEqual(galleryFor(pics, "Brent Huff", "Major Samuel"), []);
});
