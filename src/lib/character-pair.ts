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
