import { inScope } from "./who-scope";
import { allowsSeason, hiddenOf, type SpoilerLine } from "./spoiler-line";
import type { Pos, Span } from "./who-types";

/**
 * A series credit's dates are the person's OWN first-to-last episode air dates, never the show's start year.
 * When TMDB has no usable episode list the answer is the show's run, flagged as such (and the page draws no gap chip for it).
 * Pure; unit tested in tests/unit/who-spans.test.ts.
 */
export interface CreditEp { s: number; e: number; air: string }

export interface CreditSeason { s: number; air: string }

/**
 * Order of preference: the person's own episode dates; else, when TMDB's credit lists seasons instead of episodes (a regular), those
 * seasons' air dates, still the person's own; else the show's run (kind "run", approximate).
 */
export function spanFromEpisodes(key: string, eps: CreditEp[], expected: number, show: { first: string; last: string } | null, scope: Pos | null = null, seasons: CreditSeason[] = []): Span | null {
  const dated = eps.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.air)).sort((a, b) => a.air.localeCompare(b.air) || a.s - b.s || a.e - b.e);
  // A part with many episodes (a regular) often lists only a few: a short list says nothing about when they started or left.
  const complete = dated.length > 0 && (expected <= 0 || dated.length >= expected);
  if (scope) {
    // The show being watched: only what has happened up to the position, so nothing later is given away.
    const inside = dated.filter((x) => inScope(x.s, x.e, scope));
    if (!inside.length) return null;
    return { key, kind: "own", start: inside[0].air, end: inside[inside.length - 1].air, n: inside.length, eps: inside };
  }
  if (complete) return { key, kind: "own", start: dated[0].air, end: dated[dated.length - 1].air, n: dated.length, eps: dated };
  const sd = seasons.filter((x) => x.s > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.air)).map((x) => x.air).sort();
  if (sd.length) return { key, kind: "own", start: sd[0], end: sd[sd.length - 1], n: 0, eps: [] };
  if (show?.first) return { key, kind: "run", start: show.first, end: show.last || show.first, n: 0, eps: [] };
  return null;
}

/**
 * The dates of a series under a spoiler line (docs/features/spoilers.md): with a saved place, the person's own episodes up to and including it (else the
 * dates of the seasons up to its season); with none, an empty stub. Always marked `hidden`, and never the show's own run. null for a line that holds nothing back.
 */
export function spanUnderLine(key: string, line: SpoilerLine, expected: number, got: { eps: CreditEp[]; seasons: CreditSeason[] }): Span | null {
  const hidden = hiddenOf(line);
  if (!hidden) return null;
  const stub: Span = { key, kind: "own", start: "", end: "", n: 0, eps: [], hidden };
  if (line.kind !== "upto") return stub;
  const sp = spanFromEpisodes(key, got.eps, expected, null, { s: line.s, e: line.e }, []);
  if (sp) return { ...sp, hidden };
  const sd = got.seasons.filter((x) => allowsSeason(line, x.s) && /^\d{4}-\d{2}-\d{2}$/.test(x.air)).map((x) => x.air).sort();
  return sd.length ? { ...stub, start: sd[0], end: sd[sd.length - 1] } : stub;
}

/** "2020-22", "2008", for two dates. */
export function yearSpan(start: string, end: string): string {
  const a = start.slice(0, 4), b = end.slice(0, 4);
  return !a ? "" : !b || a === b ? a : `${a}-${b.slice(2)}`;
}

/** "2020-22 (show's run)": dates that are the show's, not the person's. */
export const showRunLabel = (start: string, end: string): string => `${yearSpan(start, end) || "dates unknown"} (show's run)`;

/** "during The Big Bang's run, 2007-19" for a span with no episode dates. */
export function runLabel(title: string, start: string, end: string): string {
  const years = yearSpan(start, end);
  return `during ${title}'s run${years ? `, ${years}` : ""}`;
}
