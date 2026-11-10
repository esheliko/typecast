/**
 * "Seen in": of the titles a person is known for, the one you have marked and will most likely remember them from.
 * Pure (unit tested). The browser calls it with the user's own marks; the server only supplies the facts.
 */

/** [key, title, year, character, episodes, votes, billing] as sent by /api/who/known (episodes is 0 for a film; billing is the cast position, -1 when unknown). */
export type KnownTitle = [string, string, string, string, number, number, number];
/** What the user's library says about a title: its status, and whether they rated or noted it. */
export interface KnownMark { status: string; rich: boolean }

const SEEN_WEIGHT: Record<string, number> = { watched: 1, watching: 0.85, partial: 0.6 };
/** Parts nobody remembers a face from. */
const BIT_PART = /^(the |a |an )?(young |old |little |first |second |third |angry |drunk |random )?(waiter|waitress|guard|cop|nurse|clerk|bartender|driver|student|reporter|man|woman|girl|boy|customer|extra|passenger|guest|villager|soldier|neighbou?r|receptionist|policeman|policewoman|attendant|henchman|thug|patient|singer|dancer|bystander|cashier|taxi driver|cab driver|delivery (man|boy|guy)|party guest)( #?\d+)?$/i;
const SELF = /^(self|himself|herself|themselves)\b/i;

/** The character name to show, or "" when there is no real one (empty, "Self", "Himself"...). Keeps the first of "A / B". */
export function characterName(role: string): string {
  const r = role.replace(/\s*\((uncredited|archive footage|voice|as [^)]*)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  if (!r || SELF.test(r)) return "";
  return r.split(/\s*\/\s*/)[0].trim();
}

/** How much a person's part in a title is likely to have stuck: 0..1. */
export function partWeight(role: string, eps: number, order = -1): number {
  const name = characterName(role);
  let w = !name ? 0.35 : BIT_PART.test(name) ? 0.12 : 0.85;
  if (eps > 0) {
    // A series: many episodes means a face you saw again and again; one or two means a cameo.
    w *= eps >= 20 ? 1 : eps >= 8 ? 0.9 : eps >= 4 ? 0.7 : eps >= 2 ? 0.5 : 0.35;
  } else if (!name) w *= 0.8;
  // Billing: a face from the top of the cast is remembered, one from the tail of a long cast is not.
  if (order >= 0) w *= order < 3 ? 1 : order < 8 ? 0.8 : order < 15 ? 0.5 : 0.3;
  return w;
}

/** Popularity from the vote count, 0..1 on a log scale (about 50 votes is ~0.3, 5000 is ~0.8, 20000+ is 1). */
export function fame(votes: number): number { return Math.min(1, Math.log10(Math.max(votes, 0) + 10) / 4.3); }

/** How well a face from this title is likely to be recognised, ignoring what you have seen: part size x how famous the title is. */
export function recognition(role: string, eps: number, votes: number, order = -1): number {
  return (0.1 + partWeight(role, eps, order)) * (0.3 + fame(votes));
}

/** A credit as the timeline rows have it. */
export interface RankCredit { key: string; date: string; year: string; role: string; eps: number; votes: number; order?: number }

/**
 * Order a person's credits by how likely you are to recognise them in each (same signals as pickSeenIn): the part they played, how famous the
 * title is, and a boost when you have seen it. Ties go to the newer title. `first` (the show being watched) always leads. Does not change the input.
 */
export function rankByRecognition<T extends RankCredit>(rows: T[], mark: (key: string) => KnownMark | undefined, first?: string): T[] {
  const score = (c: T) => {
    const m = mark(c.key);
    const sw = m ? SEEN_WEIGHT[m.status] ?? 0 : 0;
    return recognition(c.role, c.eps, c.votes, c.order) * (1 + sw) * (m?.rich ? 1.2 : 1);
  };
  const when = (c: T) => c.date || c.year;
  return rows.map((c) => ({ c, s: c.key === first ? Infinity : score(c) }))
    .sort((a, b) => (b.s === a.s ? when(b.c).localeCompare(when(a.c)) : b.s - a.s)).map((x) => x.c);
}

export interface Pick { key: string; title: string; year: string; character: string; score: number }

/**
 * Rank the titles you have seen the person in. Signals: your own status (finished > watching > a few episodes), how big their part
 * was (named character, number of episodes), how famous the title is (a hit is watched and discussed, so it sticks), and that you rated or
 * noted it. The current title is never offered. Returns null when you have seen none of them.
 */
export function pickSeenIn(top: KnownTitle[], exclude: string, mark: (key: string) => KnownMark | undefined): Pick | null {
  let best: Pick | null = null;
  for (const [key, title, year, role, eps, votes, order] of top) {
    if (key === exclude) continue;
    const m = mark(key);
    const sw = m ? SEEN_WEIGHT[m.status] : undefined;
    if (!sw) continue;
    // Partly watched series: only the episodes you saw count, and we do not know which, so trust the part size less.
    const score = sw * (0.1 + partWeight(role, eps, order)) * (0.3 + fame(votes)) * (m!.rich ? 1.2 : 1);
    if (!best || score > best.score) best = { key, title, year, character: characterName(role), score };
  }
  return best;
}

/** "Dr. House in House", or "Seen in House" when TMDB has no character for it. */
export function seenInText(p: Pick): string { return p.character ? `${p.character} in ${p.title}` : `Seen in ${p.title}`; }
