import { genreFit, kwFit, langFit, personMatches, type Cand, type How, type Profile } from "./foryou-rank";
import { daysUntil } from "./episodes";

/**
 * "Coming up that you may like": unreleased films and new series that are not in your library yet, ranked on your taste.
 * Pure (no fetching), so the ranking can be unit tested; the data comes from `upcoming-picks.ts`.
 * An unreleased title has almost no votes, so quality cannot be judged: the score is fit (genres, themes, language), the people
 * you like being in it, being the next part of a saga you liked, and how anticipated it is (TMDB popularity).
 */

/** An unreleased title in the pool. `date` is YYYY-MM-DD; `saga` names the liked library title of the same collection. */
export interface UpCand extends Cand { date: string; saga?: { t: string; how: How } }

/** How far ahead picks are looked for, in days. */
export const PICK_HORIZON = 365;

/** 0..1: TMDB popularity on a log scale. A big release sits around 50-300 before it is out. */
export const hype = (pop: number) => Math.max(0, Math.min(1, Math.log10(1 + pop) / 2.4));

/** Higher is better; below `MIN_PICK` is not worth suggesting in the Library. */
export function scoreUpcoming(c: UpCand, like: Profile, dislike: Profile): number {
  const people = 1 - personMatches(like, c.people).reduce((acc, m) => acc * (1 - m.s), 1);
  const fit = 0.34 * genreFit(like, c.genres) + 0.14 * kwFit(like, c.kw ?? []) + 0.08 * langFit(like, c.lang);
  const away = 0.3 * genreFit(dislike, c.genres) + 0.2 * kwFit(dislike, c.kw ?? []);
  return fit + 0.4 * people + (c.saga ? 0.45 : 0) + 0.2 * hype(c.pop) - away;
}
export const MIN_PICK = 0.3;

/** Unreleased, dated, inside the horizon and not in the library: the only titles that may be suggested. */
export function isPickable(c: { date: string }, key: string, own: Set<string>, today: string): boolean {
  if (own.has(key) || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return false;
  const n = daysUntil(c.date, today);
  return n >= 1 && n <= PICK_HORIZON;
}

/** Best first; ties go to the sooner release. */
export function rankUpcoming<T extends UpCand>(pool: T[], like: Profile, dislike: Profile): { c: T; score: number }[] {
  return pool.map((c) => ({ c, score: scoreUpcoming(c, like, dislike) })).sort((a, b) => b.score - a.score || a.c.date.localeCompare(b.c.date));
}

/** Completes "…, which <phrase>." */
const PHRASE: Record<How, string> = { loved: "you rated highly", watched: "you watched", watching: "you are watching", partial: "you watched part of", must: "is on your must-watch list", want: "is on your to-watch list" };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The one-line reason an upcoming pick is shown (hover text and the Library line). */
export function upWhy(o: { saga?: { t: string; how: How }; people: { name: string; titles: string[] }[]; genres: string[] }): string {
  const who = o.people.filter((x) => x.name).slice(0, 2);
  if (o.saga) return `Next in the saga of ${o.saga.t}, which ${PHRASE[o.saga.how]}.`;
  if (who.length) return `With ${list(who.map((x) => (x.titles[0] ? `${x.name} (${x.titles[0]})` : x.name)))}.`;
  if (o.genres.length) return `Fits your taste for ${list(o.genres.slice(0, 2))}.`;
  return "One of the most anticipated releases.";
}

/** The short form for a Library row: "Next in Dune", "With Zendaya", "Drama, Thriller". */
export function upWhyShort(o: Parameters<typeof upWhy>[0]): string {
  const who = o.people.filter((x) => x.name);
  if (o.saga) return `Next after ${o.saga.t}`;
  if (who.length) return `With ${who[0].name}`;
  if (o.genres.length) return o.genres.slice(0, 2).join(", ");
  return "Anticipated";
}
