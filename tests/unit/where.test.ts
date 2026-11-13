import test from "node:test";
import assert from "node:assert/strict";
import { streamOf, whereVerdict } from "../../src/lib/where";
import type { ProviderGroup } from "../../src/lib/types";

const disney = { id: 337, name: "Disney Plus", logo: null }, hulu = { id: 15, name: "Hulu", logo: null };
const netflix = { id: 8, name: "Netflix", logo: null }, tv = { id: 2528, name: "YouTube TV", logo: null };

// The Bear: streams in the US/UK, TMDB has no Israel entry at all.
const bear: Record<string, ProviderGroup> = {
  US: { flatrate: [disney, hulu, tv] },
  GB: { flatrate: [disney] },
  CA: { flatrate: [disney] },
  FR: { rent: [netflix] },
};

test("listed in the user's country: here", () => {
  const v = whereVerdict({ IL: { flatrate: [netflix] }, ...bear }, "IL");
  assert.equal(v.kind, "here");
  if (v.kind === "here") assert.deepEqual(v.stream.map((p) => p.name), ["Netflix"]);
});

test("free and ads count as streaming, duplicates are folded", () => {
  assert.deepEqual(streamOf({ flatrate: [netflix], ads: [netflix], free: [hulu] }).map((p) => p.id), [8, 15]);
});

test("rent or buy only in the country: paid, not elsewhere", () => {
  const v = whereVerdict({ FR: { rent: [netflix] }, US: { flatrate: [disney] } }, "FR");
  assert.deepEqual(v, { kind: "paid", rent: true, buy: false });
});

test("no entry for the country but streams abroad: elsewhere, most widespread service first", () => {
  const v = whereVerdict(bear, "IL");
  assert.equal(v.kind, "elsewhere");
  if (v.kind === "elsewhere") {
    assert.deepEqual(v.services.map((p) => p.name), ["Disney Plus", "Hulu", "YouTube TV"]);
    assert.deepEqual(v.countries, ["CA", "GB", "US"]);
    assert.equal(v.listed, false);
  }
});

test("elsewhere keeps at most max services", () => {
  const v = whereVerdict(bear, "IL", 1);
  assert.equal(v.kind === "elsewhere" && v.services.length, 1);
});

test("an empty entry for the country is flagged as listed", () => {
  const v = whereVerdict({ IL: {}, ...bear }, "IL");
  assert.equal(v.kind === "elsewhere" && v.listed, true);
});

test("nothing streaming anywhere (rent/buy only abroad): unknown", () => {
  assert.deepEqual(whereVerdict({ US: { rent: [netflix] } }, "IL"), { kind: "unknown" });
  assert.deepEqual(whereVerdict({}, "IL"), { kind: "unknown" });
});
