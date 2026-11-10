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

export interface FoundTitle { key: string; type: "movie" | "tv"; title: string; year: string; poster: string | null; /** TMDB popularity, to tell a famous title from an obscure namesake. */ pop: number; people: CastEntry[] }

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

/* ---------- the finder: cast matches first, titles in common only when they are what was asked for ---------- */

const normQ = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** TMDB popularity a title needs before a short query counts as naming it ("Nell" the 1994 film is below it, a long-running show far above). */
export const MIN_POP = 20;

/** A query names a title strongly: at least 4 letters, at the start of the title or a whole word (run of words) in it, and the title is really popular. */
export function strongTitleMatch(query: string, title: string, pop: number): boolean {
  const q = normQ(query);
  if (q.replace(/ /g, "").length < 4 || !(pop >= MIN_POP)) return false;
  const t = normQ(title);
  return t.startsWith(q) || ` ${t} `.includes(` ${q} `);
}

/**
 * Which titles in common to show under the faces. When the query matches people in the cast, only a strongly matching title is shown
 * (typing "Nell" must not put the 1994 film above Sara Rue). With no cast match the panel is the answer, so every found title stays.
 */
export function titlesForQuery(query: string, titles: FoundTitle[], hasCastMatch: boolean): FoundTitle[] {
  return hasCastMatch ? titles.filter((t) => strongTitleMatch(query, t.title, t.pop)) : titles;
}

/** Keep only the people `keep` accepts (the Women/Men chip); a title left with nobody is dropped. */
export function titlesWithPeople(titles: FoundTitle[], keep: (id: number) => boolean): FoundTitle[] {
  return titles.flatMap((t) => { const people = t.people.filter((p) => keep(p.id)); return people.length ? [{ ...t, people }] : []; });
}

/** "her" / "him" when the two people are known to differ in gender; "they" for the one whose gender is unknown next to a known one; else first names. */
export function pairLabels(a: { name: string; g: number }, b: { name: string; g: number }): [string, string] {
  const first = (n: string) => n.split(" ")[0];
  const w = (g: number) => (g === 1 ? "her" : g === 2 ? "him" : "");
  const x = w(a.g), y = w(b.g);
  if (x && y && x !== y) return [x, y];
  if (x && !y) return [x, "they"];
  if (y && !x) return ["they", y];
  return [first(a.name), first(b.name)];
}
