import { inScope } from "./who-scope";
import type { Pos, Span } from "./who-types";

/**
 * A series credit's dates are the person's OWN first-to-last episode air dates, never the show's start year.
 * When TMDB has no usable episode list the answer is the show's run, flagged as such (and the page draws no gap chip for it).
 * Pure; unit tested in tests/unit/who-spans.test.ts.
 */
export interface CreditEp { s: number; e: number; air: string }

export function spanFromEpisodes(key: string, eps: CreditEp[], expected: number, show: { first: string; last: string } | null, scope: Pos | null = null): Span | null {
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
  if (show?.first) return { key, kind: "run", start: show.first, end: show.last || show.first, n: 0, eps: [] };
  return null;
}

/** "during The Big Bang's run, 2007-19" for a span with no episode dates. */
export function runLabel(title: string, start: string, end: string): string {
  const a = start.slice(0, 4), b = end.slice(0, 4);
  const years = !a ? "" : !b || a === b ? a : `${a}-${b.slice(2)}`;
  return `during ${title}'s run${years ? `, ${years}` : ""}`;
}
