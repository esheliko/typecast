import { test } from "node:test";
import assert from "node:assert/strict";
import { decimalYear, layoutTimeline, yearTicks } from "../../src/lib/who-timeline";

test("decimal years", () => {
  assert.ok(Math.abs(decimalYear("2008-07-01") - 2008.5) < 0.02);
  assert.ok(Number.isNaN(decimalYear("")));
});

test("ticks sit on round years", () => {
  assert.deepEqual(yearTicks(2007.5, 2019.9), [2008, 2010, 2012, 2014, 2016, 2018]);
  assert.ok(yearTicks(1980, 2024).every((y) => y % 5 === 0));
});

test("single appearances are dots, runs are bars, overlaps take separate lanes", () => {
  const l = layoutTimeline([
    { id: "a", start: "2008-11-17", end: "2008-12-08" },
    { id: "b", start: "2001-01-01", end: "2010-01-01" },
    { id: "c", start: "2009-05-01", end: "2009-05-01" },
  ], null);
  const m = Object.fromEntries(l.marks.map((x) => [x.id, x]));
  assert.equal(m.a.dot, true);
  assert.equal(m.c.dot, true);
  assert.equal(m.b.dot, false);
  assert.ok(m.b.x1 - m.b.x0 > 0.3);
  assert.notEqual(m.a.lane, m.b.lane, "a bar and a dot inside it do not share a lane");
  assert.ok(l.marks.every((x) => x.x0 >= 0 && x.x1 <= 1.0001));
  assert.ok(m.c.x0 > m.a.x0, "later is further right");
});

test("the reference marker is placed on the same scale and widens the axis", () => {
  const l = layoutTimeline([{ id: "a", start: "2008-11-17", end: "2008-12-08" }], { start: "2019-11-12", end: "2019-11-12" });
  assert.ok(l.ref);
  assert.ok(l.ref!.x0 > l.marks[0].x1, "2019 is right of 2008");
  assert.ok(l.ref!.x0 < 1);
  assert.equal(layoutTimeline([], null).marks.length, 0);
});

test("a re-measure moves the marker, not the credits", () => {
  const items = [{ id: "a", start: "2008-11-17", end: "2008-12-08" }, { id: "b", start: "2019-11-12", end: "2019-11-12" }];
  const one = layoutTimeline(items, { start: "2019-11-12", end: "2019-11-12" });
  const two = layoutTimeline(items, { start: "2008-11-17", end: "2008-12-08" });
  assert.deepEqual(one.marks.map((m) => m.x0), two.marks.map((m) => m.x0));
  assert.notEqual(one.ref!.x0, two.ref!.x0);
});
