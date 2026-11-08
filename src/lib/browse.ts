import type { BrowseType, MediaType } from "./types";

/** Pure helpers shared by the server (parsing, TMDB calls) and the browser (filter UI). */

export interface Tag { id: number; name: string }
export type Sort = "popular" | "rating" | "newest" | "oldest";
export const SORTS: { value: Sort; label: string }[] = [
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];
export const RATINGS = [0, 6, 7, 8] as const;

export interface BrowseQuery {
  type: BrowseType;
  genres: number[];
  from: string; // 4-digit year or ""
  to: string;
  people: Tag[];
  companies: Tag[];
  keywords: Tag[];
  sort: Sort;
  minRating: number;
  mine: boolean; // only what's on my streaming services
}

export const DECADES: { label: string; from: string; to: string }[] = [
  { label: "2020s", from: "2020", to: "2029" },
  { label: "2010s", from: "2010", to: "2019" },
  { label: "2000s", from: "2000", to: "2009" },
  { label: "90s", from: "1990", to: "1999" },
  { label: "80s", from: "1980", to: "1989" },
  { label: "70s", from: "1970", to: "1979" },
  { label: "Older", from: "", to: "1969" },
];

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const all = (p: Params, k: string): string[] => {
  if (p instanceof URLSearchParams) return p.getAll(k);
  const v = p[k]; return v === undefined ? [] : Array.isArray(v) ? v : [v];
};
const one = (p: Params, k: string) => all(p, k)[0] ?? "";
const year = (v: string) => (/^\d{4}$/.test(v) ? v : "");

function tags(p: Params, k: string): Tag[] {
  const out: Tag[] = [];
  for (const raw of all(p, k)) {
    const i = raw.indexOf(":"); const id = Number(raw.slice(0, i));
    if (i > 0 && Number.isInteger(id) && id > 0 && !out.some((t) => t.id === id)) out.push({ id, name: raw.slice(i + 1).slice(0, 80) });
  }
  return out.slice(0, 6);
}

export function parseBrowse(p: Params): BrowseQuery {
  const sort = one(p, "sort") as Sort;
  const rating = Number(one(p, "rating"));
  let from = year(one(p, "from")), to = year(one(p, "to"));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    type: one(p, "type") === "tv" ? "tv" : one(p, "type") === "movie" ? "movie" : "all",
    genres: [...new Set(all(p, "genre").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 6),
    from, to,
    people: tags(p, "person"), companies: tags(p, "company"), keywords: tags(p, "keyword"),
    sort: SORTS.some((s) => s.value === sort) ? sort : "popular",
    minRating: (RATINGS as readonly number[]).includes(rating) ? rating : 0,
    mine: one(p, "mine") === "1",
  };
}

/** Only non-default values, so an untouched page has an empty query string. */
export function toParams(q: BrowseQuery): URLSearchParams {
  const u = new URLSearchParams();
  if (q.type !== "all") u.set("type", q.type);
  q.genres.forEach((g) => u.append("genre", String(g)));
  if (q.from) u.set("from", q.from);
  if (q.to) u.set("to", q.to);
  q.people.forEach((t) => u.append("person", `${t.id}:${t.name}`));
  q.companies.forEach((t) => u.append("company", `${t.id}:${t.name}`));
  q.keywords.forEach((t) => u.append("keyword", `${t.id}:${t.name}`));
  if (q.sort !== "popular") u.set("sort", q.sort);
  if (q.minRating) u.set("rating", String(q.minRating));
  if (q.mine) u.set("mine", "1");
  return u;
}

/** True once the user has chosen anything: then we show results instead of the trending shelf. */
export const isActive = (q: BrowseQuery) => toParams(q).size > 0;

/** Alternate items from two lists (films, series) so a mixed page shows both kinds, dropping repeats. */
export function interleave<T extends { key: string }>(a: T[], b: T[]): T[] {
  const out: T[] = [], seen = new Set<string>();
  for (let i = 0; i < Math.max(a.length, b.length); i++) for (const x of [a[i], b[i]]) if (x && !seen.has(x.key)) { seen.add(x.key); out.push(x); }
  return out;
}

/**
 * TMDB keeps separate genre lists for films and series. In "Both" mode the user sees one merged list whose ids are the
 * film ids (or the series id where films have no such genre); this maps them back to each type's own ids.
 */
const TV_FOR_FILM: Record<number, number> = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768 }; // Action, Adventure, Sci-Fi, Fantasy, War
const FILM_ONLY = new Set([36, 27, 10402, 10749, 53, 10770]); // History, Horror, Music, Romance, Thriller, TV Movie
const TV_ONLY = new Set([10762, 10763, 10764, 10766, 10767]); // Kids, News, Reality, Soap, Talk
const FILM_FOR_TV: Record<number, number> = { 10759: 28, 10765: 878, 10768: 10752 };
const TV_MERGED = new Set(Object.values(TV_FOR_FILM)); // series genres folded into the film ones above

/** One list for "Both": film genres plus the series-only ones, A to Z. */
export function mergeGenres(film: Tag[], tv: Tag[]): Tag[] {
  const out = [...film, ...tv.filter((g) => !TV_MERGED.has(g.id) && !film.some((f) => f.id === g.id))];
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Merged ids → ids for one type, or null when that type has no such genre (so it has nothing to show). */
export function genresFor(type: MediaType, ids: number[]): number[] | null {
  const out = new Set<number>();
  for (const g of ids) {
    if (type === "movie") { if (TV_ONLY.has(g)) return null; out.add(g); }
    else { if (FILM_ONLY.has(g)) return null; out.add(TV_FOR_FILM[g] ?? g); }
  }
  return [...out];
}

/** Carry the chosen genres over when Films / Series / Both changes; genres the new type lacks are dropped. */
export function convertGenres(ids: number[], from: BrowseType, to: BrowseType): number[] {
  if (from === to) return ids;
  const merged = from === "tv" ? ids.map((g) => FILM_FOR_TV[g] ?? g) : ids;
  if (to === "all") return [...new Set(merged)];
  const ok = merged.filter((g) => (to === "movie" ? !TV_ONLY.has(g) : !FILM_ONLY.has(g)));
  return [...new Set(to === "tv" ? ok.map((g) => TV_FOR_FILM[g] ?? g) : ok)];
}
