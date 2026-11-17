import { roleHas } from "./who-actor";

export interface CastLite { id: number; name: string; photo: string | null; role: string }
export interface PairInCast { a: CastLite; b: CastLite; /** Billing positions added up: lower means both are leads. */ rank: number }

/** Two typed characters ("sheldon", "penny") found in one cast: the first billed part for each, played by two different people. */
export function pairInCast(cast: CastLite[], a: readonly string[], b: readonly string[]): PairInCast | null {
  const i = cast.findIndex((c) => roleHas(c.role, a));
  if (i < 0) return null;
  const j = cast.findIndex((c, k) => k !== i && c.id !== cast[i].id && roleHas(c.role, b));
  return j < 0 ? null : { a: cast[i], b: cast[j], rank: i + j };
}

export interface CastCover { members: CastLite[]; rank: number }

/**
 * Typed words with no separator ("nolan harper lucy tim", "sheldon cooper") against one cast: the fewest parts that between them have every word in the
 * character's name, taking the part that covers the most words first, then the better billed. Null when a word is in nobody's name.
 */
export function coverCast(cast: CastLite[], words: readonly string[]): CastCover | null {
  const uniq = [...new Set(words)];
  if (!uniq.length) return null;
  const parts = cast.map((c, i) => ({ c, i, hit: uniq.filter((w) => roleHas(c.role, [w])) })).filter((p) => p.hit.length);
  const left = new Set(uniq);
  const chosen: typeof parts = [];
  while (left.size) {
    let best: { p: (typeof parts)[number]; n: number } | null = null;
    for (const p of parts) {
      if (chosen.includes(p)) continue;
      const n = p.hit.filter((w) => left.has(w)).length;
      if (n && (!best || n > best.n || (n === best.n && p.i < best.p.i))) best = { p, n };
    }
    if (!best) return null;
    chosen.push(best.p);
    best.p.hit.forEach((w) => left.delete(w));
  }
  chosen.sort((x, y) => x.i - y.i);
  return { members: chosen.map((p) => p.c), rank: chosen.reduce((s, p) => s + p.i, 0) };
}
