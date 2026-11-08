import type { NewEp } from "./types";

/**
 * "New episode" on a series that came back from Watched: pure helpers, no fetching.
 * An episode counts as new when it aired after the day the series was marked Watched.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What TMDB says about a series' episodes: the newest aired one, and when each season started. */
export interface EpisodeFacts {
  last: { s: number; e: number; date: string } | null;
  seasons: { n: number; air: string | null }[];
}

/** YYYY-MM-DD of a timestamp (ms), in UTC like TMDB's air dates. */
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * The new episode for a series marked Watched at `watchedAt` (ms), or null when nothing has aired since that day.
 * `season` is true when a whole new season started since then (specials, season 0, do not count).
 */
export function newEpisodeSince(watchedAt: number, f: EpisodeFacts | null): NewEp | null {
  const day = dayOf(watchedAt);
  if (!f?.last || !f.last.date || f.last.date <= day) return null;
  const season = f.seasons.some((s) => s.n > 0 && !!s.air && s.air > day && s.air <= f.last!.date);
  return { at: f.last.date, s: f.last.s, e: f.last.e, season };
}

/** The badge text. */
export const newEpLabel = (n: Pick<NewEp, "season">) => (n.season ? "New season" : "New episode");

/** "12 Nov" (the year is added when it is not the current one). */
export function shortDate(iso: string, now = Date.now()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}${year !== new Date(now).getUTCFullYear() ? ` ${year}` : ""}`;
}

/** "S3 E1 aired 12 Nov". */
export const newEpDetail = (n: NewEp, now = Date.now()) => `S${n.s} E${n.e} aired ${shortDate(n.at, now)}`;

/** Whether the user's progress is at or past the new episode, which settles the badge. */
export function progressPassed(progress: { s: number; e: number } | null, n: Pick<NewEp, "s" | "e">): boolean {
  return !!progress && (progress.s > n.s || (progress.s === n.s && progress.e >= n.e));
}
