/**
 * Titles from one franchise (a TMDB collection: Iron Man 1-3, the Toy Story films) are not independent evidence of taste.
 * If you watched five films of one saga and liked them all, that is mostly ONE decision ("I like this saga"), and the same
 * director, cast, genres and keywords come with every one of them. Pure, unit tested (tests/unit/franchise.test.ts).
 */

/** Each further title of the same franchise counts this much less than the one before: 1, 0.63, 0.45, 0.36, ... (five titles ~ 2.7 titles, not 5). */
export const FRANCHISE_STEP = 0.6;

/** Multiplier for the title at `rank` (0 = the strongest) within its franchise. A title with no franchise is always 1. */
export const franchiseFactor = (rank: number): number => 1 / (1 + FRANCHISE_STEP * Math.max(0, rank));

/**
 * New weights where only the strongest title of each franchise keeps its full weight. `group` is the franchise id
 * (null = not part of one). Order of the input is kept; ties go to the first one listed. Negative weights (dislikes) decay the same way
 * on their own strength, so a saga you disliked does not count as five separate dislikes either.
 */
export function decayByFranchise<T>(items: T[], weight: (x: T) => number, group: (x: T) => string | number | null | undefined): number[] {
  const order = items.map((x, i) => ({ i, g: group(x), a: Math.abs(weight(x)) })).sort((p, q) => q.a - p.a || p.i - q.i);
  const seen = new Map<string | number, number>();
  const out = items.map((x) => weight(x));
  for (const { i, g } of order) {
    if (g == null) continue;
    const rank = seen.get(g) ?? 0;
    seen.set(g, rank + 1);
    out[i] = out[i] * franchiseFactor(rank);
  }
  return out;
}

/** How many separate franchises (and loose titles) these are: a saga counts once. */
export function distinctGroups<T>(items: T[], group: (x: T) => string | number | null | undefined, id: (x: T) => string): number {
  return new Set(items.map((x) => { const g = group(x); return g == null ? `t:${id(x)}` : `f:${g}`; })).size;
}

/** At most `per` titles of any one franchise, in the order given (the best come first). */
export function capPerFranchise<T>(items: T[], group: (x: T) => string | number | null | undefined, per = 2): T[] {
  const n = new Map<string | number, number>();
  return items.filter((x) => { const g = group(x); if (g == null) return true; const c = n.get(g) ?? 0; n.set(g, c + 1); return c < per; });
}
