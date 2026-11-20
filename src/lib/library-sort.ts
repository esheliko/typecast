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

/** Rating filter: every title ("any"), only unrated ("none"), or exactly N stars. */
export const RATINGS = [["any", "Any rating"], ["none", "Unrated"], ["5", "5 stars"], ["4", "4 stars"], ["3", "3 stars"], ["2", "2 stars"], ["1", "1 star"]] as const;
export type RatingFilter = (typeof RATINGS)[number][0];
export const isRatingFilter = (s: string | undefined): s is RatingFilter => RATINGS.some(([k]) => k === s);
export const byRating = (items: LibItem[], r: RatingFilter): LibItem[] => (r === "any" ? items : r === "none" ? items.filter(isUnrated) : items.filter((l) => l.rating === Number(r)));

/** Optionally keep only one rating, sort, and optionally flip the result. Ties keep the incoming (newest-first) order. */
export function orderItems(items: LibItem[], sort: SortKey, flip: boolean, rating: RatingFilter): LibItem[] {
  const kept = byRating(items, rating);
  const by = SORTERS[sort];
  const sorted = by ? [...kept].sort(by) : kept;
  return flip ? [...sorted].reverse() : sorted;
}
