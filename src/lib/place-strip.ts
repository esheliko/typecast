import { continuePlace, episodeOrdinal, isAhead, seriesEnded } from "./watch-library";
import { daysUntil } from "./episodes";

/**
 * The place card of a Watching series (components/PlaceStrip.tsx) and the quick "Watched" buttons: pure decisions, unit tested.
 * The saved place is the library progress (the episode BEFORE the one you are on); the episode to show is `continuePlace`. Nothing here looks past that episode.
 */
type Ep = { s: number; e: number };
type SeasonCount = { n: number; eps: number };

export interface PlaceInput {
  progress: Ep | null | undefined;
  seasons: readonly SeasonCount[];
  /** The newest episode that has aired (TMDB last_episode_to_air). */
  lastEp?: Ep | null;
  /** The next episode TMDB has scheduled, with its air date. */
  next?: (Ep & { air: string }) | null;
  /** TMDB's series status ("Ended", "Canceled", "Returning Series"...). */
  status?: string;
}

export type PlaceCard =
  /** The shown episode is out: one tap marks it watched. */
  | { kind: "next"; place: Ep; watched: number; total: number | null }
  /** The shown episode exists but has not aired: no button. `air` is its date when TMDB knows it. */
  | { kind: "unaired"; place: Ep; watched: number; total: number | null; air: string }
  /** Nothing is left. `ended`: the series is over (offer "Mark series watched"); otherwise a new episode is awaited (`air` when scheduled). */
  | { kind: "done"; ended: boolean; watched: number; total: number | null; air: string };

const real = (seasons: readonly SeasonCount[]) => seasons.filter((x) => x.n >= 1 && x.eps > 0);

/** Episodes in the series (specials excluded), or null when the season sizes are unknown. */
export const totalEpisodes = (seasons: readonly SeasonCount[]): number | null => (real(seasons).length ? real(seasons).reduce((n, x) => n + x.eps, 0) : null);

/** How many episodes the saved progress covers (0 without progress), or null when it cannot be told. */
export function watchedCount(progress: Ep | null | undefined, seasons: readonly SeasonCount[]): number | null {
  if (!progress) return 0;
  return episodeOrdinal(progress, seasons.map((x) => ({ n: x.n, eps: x.eps })));
}

/** The episode after the saved progress that exists, or null when the series has nothing after it (past the last episode of the last season). */
export function upNextPlace(progress: Ep | null | undefined, seasons: readonly SeasonCount[]): Ep | null {
  const p = progress ? continuePlace(progress, seasons.length ? seasons : undefined, false) : { s: 1, e: 1 };
  if (!p) return null;
  const sz = seasons.find((x) => x.n === p.s);
  if (sz && sz.eps > 0 && p.e > sz.eps) return null; // past the end of the last season
  if (seasons.length && !sz && real(seasons).length && p.s > Math.max(...real(seasons).map((x) => x.n))) return null;
  return p;
}

/** Is that episode out? Unknown (no latest episode from TMDB) counts as out. */
export const isOut = (place: Ep, lastEp: Ep | null | undefined): boolean => !lastEp || !(lastEp.s >= 1) || !isAhead(place, lastEp);

export function placeCard(i: PlaceInput): PlaceCard {
  const total = totalEpisodes(i.seasons);
  const watched = watchedCount(i.progress, i.seasons) ?? 0;
  const place = upNextPlace(i.progress, i.seasons);
  if (!place) return { kind: "done", ended: seriesEnded(i.status ?? ""), watched, total, air: i.next?.air ?? "" };
  if (isOut(place, i.lastEp)) return { kind: "next", place, watched, total };
  return { kind: "unaired", place, watched, total, air: i.next && i.next.s === place.s && i.next.e === place.e ? i.next.air : "" };
}

/** The episode a Watching series continues with when it is OUT already, for the Watch next card ("S3 E7 · out now"). Needs season sizes and the newest aired episode. */
export function nextOut(progress: Ep | null | undefined, seasons: readonly SeasonCount[] | undefined, lastEp: Ep | null | undefined): Ep | null {
  if (!progress || !seasons?.length || !lastEp) return null;
  const p = upNextPlace(progress, seasons);
  return p && isOut(p, lastEp) ? p : null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Fri 21 Oct" for a YYYY-MM-DD date, "" when it is not one. */
export function airsOn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "airs Fri 21 Oct", or "airs today" / "airs tomorrow"; "" when the date is unknown or past. */
export function airsText(iso: string, today: string): string {
  const n = daysUntil(iso, today);
  if (!(n >= 0)) return "";
  return n === 0 ? "airs today" : n === 1 ? "airs tomorrow" : `airs ${airsOn(iso)}`;
}

/** "S3 E7". */
export const epTag = (p: Ep): string => `S${p.s} E${p.e}`;

/** The sub line: "47 min · 22 of 36 watched" (parts that are unknown are left out). */
export function subLine(runtime: number | null | undefined, watched: number, total: number | null): string {
  return [runtime && runtime > 0 ? `${runtime} min` : "", total ? `${watched} of ${total} watched` : watched ? `${watched} watched` : ""].filter(Boolean).join(" · ");
}

/** The share of the series watched, 0..100. */
export const pct = (watched: number, total: number | null): number => (total && total > 0 ? Math.max(0, Math.min(100, Math.round((watched / total) * 100))) : 0);

/**
 * Where "Watched ✓" on a library row lands: the episode after the saved progress, one step further, with no season sizes (a row has none). `size` is the size of the
 * progress' season when the click-time lookup got it; with it a season's last episode rolls to the next season's first episode.
 */
export function rowNext(progress: Ep | null | undefined, size?: number | null): Ep {
  if (!progress || !(progress.s >= 1) || !(progress.e >= 1)) return { s: 1, e: 1 };
  if (size && progress.e >= size) return { s: progress.s + 1, e: 1 };
  return { s: progress.s, e: progress.e + 1 };
}

/** Keep only the episodes up to and including `upto` (nothing past the place is fetched or kept). */
export const clipUpto = <T extends { e: number }>(eps: readonly T[], upto: number | null | undefined): T[] => (upto && upto > 0 ? eps.filter((x) => x.e <= upto) : [...eps]);

