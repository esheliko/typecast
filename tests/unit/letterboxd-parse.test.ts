import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, stars } from "../../src/lib/letterboxd-parse";

test("parseCsv handles quotes, commas and escaped quotes", () => {
  const r = parseCsv('Name,Year\n"Hello, World",2001\n"She said ""hi""",2002\n');
  assert.equal(r[0].Name, "Hello, World");
  assert.equal(r[1].Name, 'She said "hi"');
  assert.equal(r[1].Year, "2002");
});

test("stars clamps and rounds ratings to 0-5", () => {
  assert.equal(stars("4.5"), 5);
  assert.equal(stars("7"), 5);
  assert.equal(stars("-1"), 0);
  assert.equal(stars(undefined), 0);
  assert.equal(stars("abc"), 0);
});
