import type { PCredit } from "./who-types";

/**
 * "Titles in common": which of the people in scope are in a given title, and what two people were both in. Pure;
 * unit tested in tests/unit/who-common.test.ts.
 */
export interface CastEntry { id: number; role: string; /** Episodes, for a series. */ n?: number }

/** A title's cast, narrowed to the people in the roster. Each person once, in the title's billing order. */
export function intersectCast(rosterIds: ReadonlySet<number>, cast: CastEntry[]): CastEntry[] {
  const seen = new Set<number>();
  return cast.filter((c) => rosterIds.has(c.id) && !seen.has(c.id) && seen.add(c.id));
}

export interface FoundTitle { key: string; type: "movie" | "tv"; title: string; year: string; poster: string | null; people: CastEntry[] }

/** The searched titles that have someone from the roster in them, as "The Big Bang Theory: 1 person here". */
export function commonResults(titles: (Omit<FoundTitle, "people"> & { cast: CastEntry[] })[], rosterIds: ReadonlySet<number>): FoundTitle[] {
  return titles.flatMap((t) => {
    const people = intersectCast(rosterIds, t.cast);
    const { cast, ...rest } = t; void cast;
    return people.length ? [{ ...rest, people }] : [];
  });
}
export const peopleHere = (n: number) => `${n} ${n === 1 ? "person" : "people"} here`;

export interface Shared { key: string; type: "movie" | "tv"; title: string; year: string; poster: string | null; a: PCredit; b: PCredit }

/**
 * Titles two people were both in, newest first. Talk shows and appearances as themselves are left out unless `extras`.
 * `exclude` drops one title (the one being watched).
 */
export function sharedTitles(a: PCredit[], b: PCredit[], opts: { extras?: boolean; exclude?: string } = {}): Shared[] {
  const mine = new Map(b.filter((c) => opts.extras || !c.extra).map((c) => [c.key, c]));
  const out: Shared[] = [];
  const seen = new Set<string>();
  for (const c of a) {
    if (c.key === opts.exclude || seen.has(c.key) || (!opts.extras && c.extra)) continue;
    const o = mine.get(c.key);
    if (!o) continue;
    seen.add(c.key);
    out.push({ key: c.key, type: c.type, title: c.title, year: c.year, poster: c.poster, a: c, b: o });
  }
  return out.sort((x, y) => (y.a.date || y.a.year).localeCompare(x.a.date || x.a.year));
}
