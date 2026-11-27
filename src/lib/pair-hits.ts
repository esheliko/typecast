import { splitCandidates, splitPair } from "./search-pair";
import type { SearchHit } from "./types";

const TTL = 60_000;
const mem = new Map<string, { t: number; p: Promise<SearchHit[]> }>();

/**
 * The search hits for one side of a typed connection ("tom hanks"), asked for what was typed (`exact=1`) and without collections (a side never needs them).
 * One request per side per minute however many callers ask, so the search box can start it early and PairConnect picks it up. Never rejects: a failed side is no hits.
 */
export function sideHits(side: string): Promise<SearchHit[]> {
  const k = side.trim().toLowerCase();
  const hit = mem.get(k);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  const p = fetch(`/api/search?q=${encodeURIComponent(side)}&exact=1&sides=1`)
    .then(async (r) => (r.ok ? (((await r.json()).hits ?? []) as SearchHit[]) : []), () => [] as SearchHit[]);
  mem.set(k, { t: Date.now(), p });
  if (mem.size > 60) for (const [key, v] of mem) if (Date.now() - v.t >= TTL) mem.delete(key);
  return p;
}

/** Starts the side lookups a typed query is likely to need, at the same moment as the main search: both sides of "A + B", or the most even cut of "a b c d". */
export function warmSides(term: string) {
  const pair = splitPair(term);
  const sides = pair ?? splitCandidates(term)[0];
  if (sides) for (const s of sides) void sideHits(s);
}
