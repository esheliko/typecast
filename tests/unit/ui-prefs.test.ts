import test from "node:test";
import assert from "node:assert/strict";
import { parseUi, UI_DEFAULTS } from "../../src/lib/ui-prefs";

test("no cookie or a broken one gives the defaults", () => {
  assert.deepEqual(parseUi(undefined), UI_DEFAULTS);
  assert.deepEqual(parseUi("%7Bnot json"), UI_DEFAULTS);
});

test("saved choices are read back, junk values are ignored", () => {
  const raw = encodeURIComponent(JSON.stringify({ unClosed: true, unSrc: "new", unKind: "tv", upOpen: true, unMine: "yes" }));
  assert.deepEqual(parseUi(raw), { ...UI_DEFAULTS, unClosed: true, unSrc: "new", unKind: "tv", upOpen: true });
});
