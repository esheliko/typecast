/** Sort choices for the library. Kept out of the client component so the server page can call isSort. */
export const SORTS = [["added", "Recently added"], ["title", "Title A–Z"], ["year", "Year, newest"], ["yearOld", "Year, oldest"], ["rating", "My rating"], ["watched", "Recently watched"]] as const;
export type SortKey = (typeof SORTS)[number][0];
export const isSort = (s: string | undefined): s is SortKey => SORTS.some(([k]) => k === s);
