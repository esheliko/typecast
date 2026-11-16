/**
 * Pure ranking for the Connections tab suggestions.
 * A candidate scores by how many times it links to the first pick, plus a bonus for being in the user's library.
 */
export interface Cand<T> { item: T; links: number; via: string[]; mine: number }

export const MINE_BONUS = 2;

export function score(c: { links: number; mine: number }): number {
  return c.links * 2 + (c.mine > 0 ? MINE_BONUS + Math.min(c.mine, 3) - 1 : 0);
}

/** Highest score first. Candidates with neither a link nor a library presence are dropped. */
export function rankCands<T>(list: Cand<T>[], limit: number): Cand<T>[] {
  return list.filter((c) => c.links > 0 || c.mine > 0).sort((a, b) => score(b) - score(a)).slice(0, limit);
}

const join = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} more`);

/** One line saying why it is suggested. `who` is the first pick's name, `unit` what links are counted in ("title" / "actor"). */
export function whyLine(c: { links: number; via: string[]; mine: number }, who: string, unit: "title" | "actor", inLibrary = "in your library"): string {
  const parts: string[] = [];
  if (c.links > 0) parts.push(unit === "title"
    ? `${c.links} ${c.links === 1 ? "title" : "titles"} with ${who}${c.via.length ? ` (${join(c.via)})` : ""}`
    : `${c.links} ${c.links === 1 ? "actor" : "actors"} in common${c.via.length ? `: ${join(c.via)}` : ""}`);
  if (c.mine > 0) parts.push(c.mine > 1 ? `${c.mine} of yours` : inLibrary);
  return parts.join(" · ");
}
