import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeAwards } from "../../src/lib/awards";

const v = (value: string) => ({ value });

  test("attaches the person to the matching award and year", () => {
    const rows = [
      { awLabel: v("Academy Award for Best Supporting Actress"), kind: v("won"), year: v("2017") },
      { awLabel: v("Academy Award for Best Actor"), kind: v("nom"), year: v("2017") },
    ];
    const people = [
      { pLabel: v("Viola Davis"), awLabel: v("Academy Award for Best Supporting Actress"), kind: v("won"), year: v("2017") },
      { pLabel: v("Q42101"), awLabel: v("Academy Award for Best Actor"), kind: v("nom"), year: v("2017") },
    ];
    const g = shapeAwards(rows, people).groups[0];
    assert.deepEqual(g.won[0].who, ["Viola Davis"]);
    assert.equal(g.nominated[0].who, undefined);
  });
  test("works without people", () => {
    const g = shapeAwards([{ awLabel: v("Academy Award for Best Picture"), kind: v("won"), year: v("2017") }]).groups[0];
    assert.equal(g.won[0].who, undefined);
  });
