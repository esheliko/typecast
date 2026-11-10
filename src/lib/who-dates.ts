import type { Range } from "./who-types";

/**
 * Dates for /who: formatting, ages and the gap between two appearances. Pure, no time zones: dates are calendar dates
 * ("2008-11-17"), and a year or year-month alone is accepted. Unit tested in tests/unit/who-dates.test.ts.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface YMD { y: number; m: number; d: number }

export function parseDate(s: string | null | undefined): YMD | null {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s ?? "");
  if (!m) return null;
  const y = +m[1], mo = m[2] ? +m[2] : 1, d = m[3] ? +m[3] : 1;
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { y, m: mo, d } : null;
}

export const fmtMonth = (s: string | null | undefined): string => { const p = parseDate(s); return p ? `${MONTHS[p.m - 1]} ${p.y}` : ""; };
export const fmtDay = (s: string | null | undefined): string => { const p = parseDate(s); return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : ""; };

/** "Nov 2008", "Nov-Dec 2008", "Nov 2008-Mar 2010", "2008-19" style is not used: ranges always name months. */
export function fmtRange(start: string, end: string): string {
  const a = parseDate(start), b = parseDate(end);
  if (!a) return "";
  if (!b || (a.y === b.y && a.m === b.m)) return `${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m - 1]}-${MONTHS[b.m - 1]} ${a.y}`;
  return `${MONTHS[a.m - 1]} ${a.y}-${MONTHS[b.m - 1]} ${b.y}`;
}

/** Whole years of age on `at` for someone born on `birth`. Null when either date is unknown. */
export function ageAt(birth: string | null | undefined, at: string | null | undefined): number | null {
  const b = parseDate(birth), a = parseDate(at);
  if (!b || !a) return null;
  let age = a.y - b.y;
  if (a.m < b.m || (a.m === b.m && a.d < b.d)) age--;
  return age >= 0 ? age : null;
}

/** Whole months from `a` to `b` (a before b). Never negative. */
export function monthsBetween(a: string, b: string): number {
  const x = parseDate(a), y = parseDate(b);
  if (!x || !y) return 0;
  let m = (y.y - x.y) * 12 + (y.m - x.m);
  if (y.d < x.d) m--;
  return Math.max(0, m);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * A gap in words. Under a year: months. A year to three: years and months ("1 year 5 months"). Longer: the nearest whole year,
 * so 10 years 11 months reads "11 years".
 */
export function gapLabel(months: number): string {
  const m = Math.max(0, Math.round(months));
  if (m < 1) return "less than a month";
  if (m < 12) return plural(m, "month");
  if (m < 36) { const y = Math.floor(m / 12), r = m % 12; return r ? `${plural(y, "year")} ${plural(r, "month")}` : plural(y, "year"); }
  return plural(Math.round(m / 12), "year");
}

export type GapDir = "before" | "after" | "same";
export interface Gap { dir: GapDir; months: number }

/** How far `r` sits from the reference: the end of the earlier one to the start of the later one. Overlapping ranges are "same". */
export function gapBetween(r: Range, ref: Range): Gap {
  if (r.end < ref.start) return { dir: "before", months: monthsBetween(r.end, ref.start) };
  if (r.start > ref.end) return { dir: "after", months: monthsBetween(ref.end, r.start) };
  return { dir: "same", months: 0 };
}

/** The chip on a row: "11 years before", "2 years after", "same time". */
export function gapChip(g: Gap, approx = false): string {
  return g.dir === "same" ? (approx ? "about the same time" : "same time") : `${approx ? "about " : ""}${gapLabel(g.months)} ${g.dir}`;
}

/** The readout sentence: "The Big Bang Theory (Nov-Dec 2008) was 11 years before The Rookie S2 E8 (Nov 2019)". */
export function readout(a: { label: string; range: Range; approx?: boolean }, ref: { label: string; range: Range }): string {
  const g = gapBetween(a.range, ref.range);
  const A = `${a.label} (${fmtRange(a.range.start, a.range.end)})`, B = `${ref.label} (${fmtRange(ref.range.start, ref.range.end)})`;
  if (g.dir === "same") return `${A} overlapped ${B}`;
  return `${A} was ${a.approx ? "about " : ""}${gapLabel(g.months)} ${g.dir} ${B}`;
}

/**
 * Under a person's name: "born 1974, 45 in this episode, 52 today", or "1974-2019, 45 in this episode" when they have died.
 * `at` is the date of what is being watched and `atLabel` how to call it ("in this episode", "when this came out").
 * Whatever is unknown is left out.
 */
export function lifeLine(birth: string, death: string, at: string, atLabel: string, today: string): string {
  const b = parseDate(birth);
  if (!b) return "";
  const parts: string[] = [];
  const d = parseDate(death);
  parts.push(d ? `${b.y}-${d.y}` : `born ${b.y}`);
  const then = ageAt(birth, at);
  if (then != null) parts.push(`${then} ${atLabel}`);
  if (d) { const end = ageAt(birth, death); if (end != null) parts.push(`died aged ${end}`); }
  else { const now = ageAt(birth, today); if (now != null) parts.push(`${now} today`); }
  return parts.join(", ");
}

/** A range for one date. */
export const day = (d: string): Range => ({ start: d, end: d });

/** A series' years beside its name: "2009-2017", "2019-" while it is still going, or just "2009" (one year, or the end is not known). */
export function yearsLabel(year: string, show?: { first: string; last: string; ongoing: boolean } | null): string {
  if (!show) return year;
  const a = (show.first || "").slice(0, 4) || year, b = (show.last || "").slice(0, 4);
  if (show.ongoing) return a ? `${a}\u2013` : year;
  return a && b && b !== a ? `${a}\u2013${b}` : a || year;
}
