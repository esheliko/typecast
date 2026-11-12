import { hiddenOf, isHidden, type HiddenLine, type SpoilerLine } from "./spoiler-line";

/**
 * Step 4B-2: masking what a person's credits tell about a series that is Watching in the library (docs/features/spoilers.md). Pure (unit tested in
 * tests/unit/spoiler-mask.test.ts). Rule of thumb: for a held-back series a credit keeps its title, role and poster, and loses everything that
 * gives the run away: how many episodes the person was in, the credit ids (which list them) and the "from <year>" of their first episode.
 */

/** A series the library says is Watching: the one case where a person's part in it is not told without checking the saved place. Films never. */
export const isWatchingSeries = (key: string, status: string | null | undefined): boolean => key.startsWith("tv:") && status === "watching";

/**
 * The mark "Seen in" / "You know them from" may use for a title: a series that is Watching is NOT counted as seen (we do not know that the
 * person has appeared yet at the saved place), everything else is as it was. Watched, Partly watched and films keep working.
 */
export function seenMark<M extends { status: string }>(key: string, m: M | undefined): M | undefined {
  return m && isWatchingSeries(key, m.status) ? undefined : m;
}

/** A person's credit as /api/who/person sends it (the fields that matter here). */
export interface MaskableCredit { key: string; type: string; eps: number; cids: string[]; hidden?: HiddenLine }

/**
 * /api/who/person under the line: a held-back series has no episode count and no credit ids, and carries the `hidden` marker so the screen can
 * draw the gate. Other credits (films, series that are not held back) come back untouched (the same objects).
 */
export function holdBackCredits<T extends MaskableCredit>(credits: T[], lines: Record<string, SpoilerLine>): T[] {
  return credits.map((c) => {
    const l = c.type === "tv" ? lines[c.key] : undefined;
    return l && isHidden(l) ? { ...c, eps: 0, cids: [], hidden: hiddenOf(l) } : c;
  });
}

/** A filmography item (a cast member's other credits, a person's page) with the run-giving fields dropped for a held-back series. */
export function maskCreditItem<T extends { key: string; eps?: number; since?: string; cids?: string[] }>(it: T, status: string | null | undefined): T {
  if (!isWatchingSeries(it.key, status) || (!it.eps && !it.since && !it.cids?.length)) return it;
  return { ...it, eps: undefined, since: undefined, cids: undefined };
}

/** A season's cast under the line: no per-person episode counts or credit ids (they give each actor's run away). */
export function holdBackCast<T extends { eps?: number; credits?: string[] }>(cast: T[], l: SpoilerLine): T[] {
  return isHidden(l) ? cast.map((c) => (c.eps || c.credits?.length ? { ...c, eps: undefined, credits: undefined } : c)) : cast;
}

/** A series credit the library has as Watching, i.e. one whose "seen in" claim needs the saved place to be safe. */
export const heldHit = (k: { key: string }, l: { status: string } | undefined): boolean => isWatchingSeries(k.key, l?.status);
