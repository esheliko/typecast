import type { LibItem } from "./types";

/** Sort choices for the library. Kept out of the client component so the server page can call isSort. */
export const SORTS = [["added", "Recently added"], ["title", "Title A–Z"], ["year", "Year, newest"], ["yearOld", "Year, oldest"], ["rating", "My rating"], ["watched", "Recently watched"]] as const;
export type SortKey = (typeof SORTS)[number][0];
export const isSort = (s: string | undefined): s is SortKey => SORTS.some(([k]) => k === s);

const num = (y: string) => parseInt(y, 10) || 0;
export const SORTERS: Record<SortKey, ((a: LibItem, b: LibItem) => number) | null> = {
  added: null, // the library arrives newest-first
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
  year: (a, b) => num(b.year) - num(a.year),
  yearOld: (a, b) => (num(a.year) || 9999) - (num(b.year) || 9999),
  rating: (a, b) => b.rating - a.rating,
  watched: (a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0),
};

/** Not rated by you (`rating` is 0-5, 0 = none). */
export const isUnrated = (l: Pick<LibItem, "rating">) => !l.rating;

/** Optionally keep only unrated titles, sort, and optionally flip the result. Ties keep the incoming (newest-first) order. */
export function orderItems(items: LibItem[], sort: SortKey, flip: boolean, unrated: boolean): LibItem[] {
  const kept = unrated ? items.filter(isUnrated) : items;
  const by = SORTERS[sort];
  const sorted = by ? [...kept].sort(by) : kept;
  return flip ? [...sorted].reverse() : sorted;
}
