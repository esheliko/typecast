import test from "node:test";
import assert from "node:assert/strict";
import { parseText, parseAny } from "../../src/lib/list-parse";

test("checkbox lines decide watched vs to-watch", () => {
  const r = parseText("[x] Heat (1995)\n[ ] Ronin (1998)", "watchlist");
  const heat = r.find((e) => e.name === "Heat"), ronin = r.find((e) => e.name === "Ronin");
  assert.ok(heat?.watched && !heat.watchlist);
  assert.ok(ronin?.watchlist && !ronin.watched);
  assert.equal(heat?.year, 1995);
});

test("plain lines follow the default", () => {
  assert.ok(parseText("Alien", "watched")[0].watched);
  assert.ok(parseText("Alien", "watchlist")[0].watchlist);
});

test("duplicate lines collapse into one entry", () => {
  assert.equal(parseText("Alien\nalien", "watched").length, 1);
});

test("empty input yields no entries", () => {
  assert.deepEqual(parseText("", "watched"), []);
  assert.deepEqual(parseAny([], "watched"), []);
});

test("a Letterboxd watched.csv is read as a CSV, not as free text", () => {
  const csv = "Date,Name,Year,Letterboxd URI\n2024-01-02,Heat,1995,https://boxd.it/x\n";
  const r = parseAny([{ name: "watched.csv", text: csv }], "watchlist");
  assert.equal(r.length, 1);
  assert.equal(r[0].name, "Heat");
  assert.ok(r[0].watched);
});
