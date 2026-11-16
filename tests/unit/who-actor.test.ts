import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchCredits, splitActorQuery } from "../../src/lib/who-actor";
import type { PCredit } from "../../src/lib/who-types";

const c = (id: number, title: string, role: string, votes = 1): PCredit => ({ key: `movie:${id}`, type: "movie", id, title, year: "2000", poster: null, role, date: "", eps: 0, cids: [], extra: false, votes });
const people = [{ name: "George" }, { name: "George Clooney" }, { name: "Kate Winslet" }];

describe("splitActorQuery", () => {
  it("takes the longest full name and drops filler", () => {
    const r = splitActorQuery("george clooney as criminal", people)!;
    assert.equal(r.person.name, "George Clooney");
    assert.deepEqual(r.rest, ["criminal"]);
    assert.deepEqual(splitActorQuery("Kate Winslet spotless mind", people)!.rest, ["spotless", "mind"]);
  });
  it("needs the whole name", () => assert.equal(splitActorQuery("kate", people), null));
});

describe("matchCredits", () => {
  const list = [c(1, "Eternal Sunshine of the Spotless Mind", "Clementine Kruczynski"), c(2, "Heat", "Convict Joe"), c(3, "Law", "Attorney Pelly", 5)];
  it("matches a title, a character, or a close word for the part", () => {
    assert.deepEqual(matchCredits(list, ["spotless", "mind"]).map((m) => m.credit.id), [1]);
    assert.deepEqual(matchCredits(list, ["criminal"]).map((m) => m.credit.id), [2]);
    assert.deepEqual(matchCredits(list, ["lawyer"]).map((m) => m.credit.id), [3]);
    assert.deepEqual(matchCredits(list, ["clementine"]).map((m) => m.by), ["role"]);
  });
  it("lists their best work with nothing left over", () => assert.equal(matchCredits(list, []).length, 3));
});
