import { test } from "node:test";
import assert from "node:assert/strict";
import { ageAt, fmtMonth, fmtRange, gapBetween, gapChip, gapLabel, lifeLine, monthsBetween, readout } from "../../src/lib/who-dates";

test("months between two dates, never negative, day of month counts", () => {
  assert.equal(monthsBetween("2008-12-08", "2019-11-12"), 131);
  assert.equal(monthsBetween("2008-12-08", "2019-11-02"), 130);
  assert.equal(monthsBetween("2019-01-01", "2018-01-01"), 0);
  assert.equal(monthsBetween("2019", "2020"), 12);
});

test("gap in years and months: under a year reads in months", () => {
  assert.equal(gapLabel(0), "less than a month");
  assert.equal(gapLabel(1), "1 month");
  assert.equal(gapLabel(5), "5 months");
  assert.equal(gapLabel(11), "11 months");
  assert.equal(gapLabel(12), "1 year");
  assert.equal(gapLabel(17), "1 year 5 months");
  assert.equal(gapLabel(24), "2 years");
  assert.equal(gapLabel(35), "2 years 11 months");
  assert.equal(gapLabel(131), "11 years", "10 years 11 months reads as 11 years");
  assert.equal(gapLabel(120), "10 years");
});

test("gap between a range and a reference: before, after, same", () => {
  const ref = { start: "2019-11-12", end: "2019-11-12" };
  assert.deepEqual(gapBetween({ start: "2008-11-17", end: "2008-12-08" }, ref), { dir: "before", months: 131 });
  assert.equal(gapChip(gapBetween({ start: "2008-11-17", end: "2008-12-08" }, ref)), "11 years before");
  assert.equal(gapChip(gapBetween({ start: "2020-03-01", end: "2020-03-01" }, ref)), "3 months after");
  assert.equal(gapChip(gapBetween({ start: "2019-10-01", end: "2019-12-01" }, ref)), "same time");
});

test("readout puts the comparison in words", () => {
  assert.equal(
    readout({ label: "The Big Bang Theory", range: { start: "2008-11-17", end: "2008-12-08" } }, { label: "The Rookie S2 E8", range: { start: "2019-11-12", end: "2019-11-12" } }),
    "The Big Bang Theory (Nov-Dec 2008) was 11 years before The Rookie S2 E8 (Nov 2019)",
  );
  assert.match(readout({ label: "A", range: { start: "2021-01-01", end: "2021-01-01" } }, { label: "B", range: { start: "2019-01-01", end: "2019-01-01" } }), /was 2 years after B/);
});

test("range formatting", () => {
  assert.equal(fmtRange("2008-11-17", "2008-11-17"), "Nov 2008");
  assert.equal(fmtRange("2008-11-17", "2008-11-24"), "Nov 2008");
  assert.equal(fmtRange("2008-11-17", "2008-12-08"), "Nov-Dec 2008");
  assert.equal(fmtRange("2008-11-17", "2010-03-01"), "Nov 2008-Mar 2010");
  assert.equal(fmtMonth("2019-11-12"), "Nov 2019");
  assert.equal(fmtMonth(""), "");
});

test("ages are computed from real dates", () => {
  assert.equal(ageAt("1979-01-26", "2019-11-12"), 40);
  assert.equal(ageAt("1979-12-26", "2019-11-12"), 39, "birthday not reached yet that year");
  assert.equal(ageAt("1979-11-12", "2019-11-12"), 40, "on the birthday");
  assert.equal(ageAt("", "2019-11-12"), null);
  assert.equal(ageAt("1979-01-26", ""), null);
  assert.equal(ageAt("2020-01-01", "2019-01-01"), null, "not born yet");
});

test("life line: omits what is unknown, uses life dates for the dead", () => {
  assert.equal(lifeLine("1974-05-05", "", "2019-11-12", "in this episode", "2026-11-09"), "born 1974, 45 in this episode, 52 today");
  assert.equal(lifeLine("1974-05-05", "", "", "in this episode", "2026-11-09"), "born 1974, 52 today");
  assert.equal(lifeLine("1944-05-05", "2019-01-01", "2010-01-01", "in this episode", "2026-11-09"), "1944-2019, 65 in this episode, died aged 74");
  assert.equal(lifeLine("", "", "2019-11-12", "in this episode", "2026-11-09"), "");
});
