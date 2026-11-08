import { daysUntil, epCode, untilLabel } from "./episodes";
import type { Item, LibItem } from "./types";

/**
 * "Upcoming from your list": unreleased films you saved and the next episode of series in your library. Pure helpers, no
 * fetching and no React, so the dates and grouping can be unit tested. Dates are calendar days (YYYY-MM-DD) as TMDB gives them.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Most titles looked up on TMDB for one page load. */
export const MAX_LOOKUPS = 40;
/** A film further out than this shows its month only: TMDB often holds a placeholder day for far-off releases. */
export const APPROX_DAYS = 120;
/** Nothing further out than this is listed. */
export const HORIZON_DAYS = 366;

/** What TMDB says about when a title next arrives. For a film `date` is its release date, for a series the next episode's air date. */
export interface UpFacts { date: string; s?: number; e?: number; epName?: string; svc?: string | null }

export interface UpEntry extends Item {
  /** YYYY-MM-DD */
  date: string;
  kind: "film" | "episode";
  /** "S5 E1" for a series. */
  code: string | null;
  /** "New season", "Premiere" or "Must watch". */
  note: string | null;
  must: boolean;
  svc: string | null;
  /** The day is not reliable (a film far in the future): show the month only. */
  approx: boolean;
}

export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

const THIS_YEAR = (today: string) => Number(today.slice(0, 4));

/**
 * Which library titles are worth asking TMDB about, most useful first, at most `cap`. Films already out are skipped without a
 * request: a film saved with a release year before this one cannot be unreleased. Series are always candidates, since any of
 * them may have an episode coming. Order: series in progress, must-watch films, watched series (newest activity first), the rest.
 */
export function candidates(lib: LibItem[], today: string, cap = MAX_LOOKUPS): LibItem[] {
  const year = THIS_YEAR(today);
  const open = lib.filter((l) => l.type === "tv" || (l.status === "watchlist" && (!/^\d{4}$/.test(l.year) || Number(l.year) >= year)));
  const rank = (l: LibItem) =>
    l.type === "tv" && (l.status === "watching" || l.status === "partial") ? 0
    : l.type === "movie" && l.priority === "must" ? 1
    : l.type === "tv" && l.status === "watched" ? 2
    : 3;
  return [...open].sort((a, b) => rank(a) - rank(b) || b.updated - a.updated).slice(0, cap);
}

/** "New season" for episode 1 of a later season, "Premiere" for the first episode of the first season. */
export function episodeNote(s: number, e: number): string | null {
  if (e !== 1) return null;
  return s <= 1 ? "Premiere" : "New season";
}

/** The list entry for one title, or null when TMDB has no future date for it (or it is past, or too far away). */
export function buildEntry(l: LibItem, f: UpFacts | null | undefined, today: string): UpEntry | null {
  if (!f || !/^\d{4}-\d{2}-\d{2}/.test(f.date ?? "")) return null;
  const date = f.date.slice(0, 10);
  const n = daysUntil(date, today);
  if (!(n >= 0) || n > HORIZON_DAYS) return null;
  const film = l.type === "movie";
  const must = film && l.priority === "must";
  const code = !film && f.s != null && f.e != null ? epCode(f.s, f.e) : null;
  return {
    key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster,
    date, kind: film ? "film" : "episode", code,
    note: film ? (must ? "Must watch" : null) : f.s != null && f.e != null ? episodeNote(f.s, f.e) : null,
    must, svc: f.svc ?? null, approx: film && n > APPROX_DAYS,
  };
}

/** Date, then must-watch first, then title: the order inside every group. */
export const byDate = (a: UpEntry, b: UpEntry) => a.date.localeCompare(b.date) || Number(b.must) - Number(a.must) || a.title.localeCompare(b.title);

export interface UpGroup { label: string; entries: UpEntry[] }

/**
 * This week (today to 7 days out), This month (the rest of the current month), then one group per later month.
 * A date later than the 7 days but still in the current month goes to This month, even if it is the last day.
 */
export function groupUpcoming(entries: UpEntry[], today: string): UpGroup[] {
  const sorted = [...entries].sort(byDate);
  const groups: UpGroup[] = [];
  const put = (label: string, e: UpEntry) => {
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.entries.push(e); else groups.push({ label, entries: [e] });
  };
  for (const e of sorted) {
    const n = daysUntil(e.date, today);
    if (n <= 7) put("This week", e);
    else if (e.date.slice(0, 7) === today.slice(0, 7)) put("This month", e);
    else {
      const y = Number(e.date.slice(0, 4)), m = Number(e.date.slice(5, 7)) - 1;
      put(`${MONTH_NAMES[m]}${y !== THIS_YEAR(today) ? ` ${y}` : ""}`, e);
    }
  }
  return groups;
}

/** "Wed 12 Nov" (with the year when it is not this year); "Dec 2027" for an approximate date. */
export function dateLabel(e: Pick<UpEntry, "date" | "approx">, today: string): string {
  const y = Number(e.date.slice(0, 4)), m = Number(e.date.slice(5, 7)) - 1, d = Number(e.date.slice(8, 10));
  if (e.approx) return `${MONTHS[m]} ${y}`;
  const wd = DAYS[new Date(Date.UTC(y, m, d)).getUTCDay()];
  return `${wd} ${d} ${MONTHS[m]}${y !== THIS_YEAR(today) ? ` ${y}` : ""}`;
}

/** "today", "in 4 days", "in 3 months", or "date may change" for an approximate date. */
export const countdown = (e: Pick<UpEntry, "date" | "approx">, today: string) => (e.approx ? "date may change" : untilLabel(e.date, today));

/** Today and tomorrow get the gold pill. */
export const isSoon = (e: Pick<UpEntry, "date" | "approx">, today: string) => !e.approx && daysUntil(e.date, today) <= 1;

/** The line under the title: "S5 E1 · New season", "Film · Must watch". */
export function subLine(e: UpEntry): string {
  return [e.code ?? "Film", e.note].filter(Boolean).join(" · ");
}
