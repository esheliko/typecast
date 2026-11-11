import { test } from "node:test";
import assert from "node:assert/strict";
import { missingGuests, normName, parseGuestcast } from "../../src/lib/tvmaze";

test("normName ignores case, accents and punctuation", () => {
  assert.equal(normName("Zoë  Saldaña"), normName("zoe saldana"));
  assert.equal(normName("Mary-Kate O'Neil"), "marykateoneil");
});

test("missingGuests keeps only people TMDB lacks, once each", () => {
  const tmdb = ["Rainn Wilson", "Frankie Muniz"];
  const tvm = [
    { name: "Rainn Wilson", role: "Rainn Wilson" },
    { name: "Daniel Lissing", role: "Sterling Freeman" },
    { name: "daniel  lissing", role: "Sterling Freeman" },
  ];
  assert.deepEqual(missingGuests(tmdb, tvm), [{ name: "Daniel Lissing", role: "Sterling Freeman" }]);
});

test("parseGuestcast tolerates junk", () => {
  assert.deepEqual(parseGuestcast(null), []);
  assert.deepEqual(parseGuestcast([{ person: { name: " A B " }, character: { name: "X" } }, { person: {} }, {}]), [{ name: "A B", role: "X" }]);
});
