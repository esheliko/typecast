/** Films / Series filter shared by every title list. "all" shows both. */
export type Kind = "all" | "movie" | "tv";

export const KINDS: [Kind, string][] = [["all", "Both"], ["movie", "Films"], ["tv", "Series"]];

export const isKind = (v: unknown): v is Kind => v === "all" || v === "movie" || v === "tv";

/** The items of that kind (all of them for "all"). */
export function ofKind<T extends { type: string }>(items: T[], kind: Kind): T[] {
  return kind === "all" ? items : items.filter((i) => i.type === kind);
}

/** True when the list holds both films and series, so a Films / Series choice would change it. */
export function mixed(items: { type: string }[]): boolean {
  let movie = false, tv = false;
  for (const i of items) { if (i.type === "tv") tv = true; else movie = true; if (movie && tv) return true; }
  return false;
}
