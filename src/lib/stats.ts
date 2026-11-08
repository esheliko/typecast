import type { LibItem, MediaType, Status } from "./types";

/** Pure aggregation for the Library stats page. No I/O: everything takes the library (or fetched titles) and returns plain data. */

export type StatYear = number | "all";
export interface Counted { label: string; n: number }
export interface Streak { weeks: number; from: number; to: number }

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const yearOf = (ms: number) => new Date(ms).getUTCFullYear();

/** Years that have something watched, newest first. */
export function watchedYears(lib: LibItem[]): number[] {
  const ys = new Set<number>();
  for (const l of lib) if (l.status === "watched" && l.watchedAt != null) ys.add(yearOf(l.watchedAt));
  return [...ys].sort((a, b) => b - a);
}

/** Reads the `y` query value; anything that is not a year with data means all time. */
export function parseYear(y: string | undefined, years: number[]): StatYear {
  const n = Number(y);
  return Number.isInteger(n) && years.includes(n) ? n : "all";
}

/** Watched titles in the chosen year. A watched title with no watch date only belongs to all time. */
export function watchedIn(lib: LibItem[], year: StatYear): LibItem[] {
  return lib.filter((l) => l.status === "watched" && (year === "all" || (l.watchedAt != null && yearOf(l.watchedAt) === year)));
}

/** Whole weeks since a fixed Monday: consecutive numbers are consecutive calendar weeks (UTC, weeks start on Monday). */
export const weekIndex = (ms: number) => Math.floor((Math.floor(ms / DAY) + 3) / 7);
const weekStart = (w: number) => (w * 7 - 3) * DAY;

/** The longest run of consecutive weeks that each have at least one watch date. */
export function longestStreak(dates: number[]): Streak | null {
  const weeks = [...new Set(dates.map(weekIndex))].sort((a, b) => a - b);
  if (!weeks.length) return null;
  let best = { start: weeks[0], len: 1 }, cur = { start: weeks[0], len: 1 };
  for (let i = 1; i < weeks.length; i++) {
    cur = weeks[i] === weeks[i - 1] + 1 ? { start: cur.start, len: cur.len + 1 } : { start: weeks[i], len: 1 };
    if (cur.len > best.len) best = cur;
  }
  return { weeks: best.len, from: weekStart(best.start), to: weekStart(best.start + best.len - 1) };
}

export interface LibraryStats {
  total: number;
  byStatus: Record<Status, number>;
  /** Of the watched titles in the chosen year. */
  films: number; series: number; watched: number;
  perYear: Counted[];
  /** The 12 months ending with the one containing `now`, oldest first. */
  perMonth: Counted[];
  /** Index 0 is 1 star … index 4 is 5 stars. */
  ratings: number[]; rated: number; avgRating: number | null;
  streak: Streak | null;
  oldest: LibItem | null; newest: LibItem | null;
  decades: Counted[];
}

export function libraryStats(lib: LibItem[], year: StatYear, now: number): LibraryStats {
  const byStatus: Record<Status, number> = { watching: 0, partial: 0, watchlist: 0, watched: 0 };
  for (const l of lib) byStatus[l.status]++;
  const scope = watchedIn(lib, year);

  const years = new Map<number, number>();
  for (const l of lib) if (l.status === "watched" && l.watchedAt != null) years.set(yearOf(l.watchedAt), (years.get(yearOf(l.watchedAt)) ?? 0) + 1);

  const d = new Date(now);
  const months: (Counted & { key: string })[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push({ key: `${m.getUTCFullYear()}-${m.getUTCMonth()}`, label: `${MONTHS[m.getUTCMonth()]} ${String(m.getUTCFullYear()).slice(2)}`, n: 0 });
  }
  for (const l of lib) {
    if (l.status !== "watched" || l.watchedAt == null) continue;
    const w = new Date(l.watchedAt);
    const hit = months.find((m) => m.key === `${w.getUTCFullYear()}-${w.getUTCMonth()}`);
    if (hit) hit.n++;
  }

  const ratings = [0, 0, 0, 0, 0];
  let sum = 0, rated = 0;
  for (const l of scope) {
    if (!(l.rating > 0)) continue;
    ratings[Math.min(5, Math.max(1, Math.round(l.rating))) - 1]++;
    sum += l.rating; rated++;
  }

  const dated = scope.filter((l) => l.year && parseInt(l.year, 10) > 0);
  const ry = (l: LibItem) => parseInt(l.year, 10);
  const oldest = dated.reduce<LibItem | null>((a, l) => (!a || ry(l) < ry(a) ? l : a), null);
  const newest = dated.reduce<LibItem | null>((a, l) => (!a || ry(l) > ry(a) ? l : a), null);

  const decades = new Map<number, number>();
  for (const l of dated) decades.set(Math.floor(ry(l) / 10) * 10, (decades.get(Math.floor(ry(l) / 10) * 10) ?? 0) + 1);

  return {
    total: lib.length, byStatus,
    films: scope.filter((l) => l.type === "movie").length, series: scope.filter((l) => l.type === "tv").length, watched: scope.length,
    perYear: [...years].sort((a, b) => a[0] - b[0]).map(([y, n]) => ({ label: String(y), n })),
    perMonth: months.map(({ label, n }) => ({ label, n })),
    ratings, rated, avgRating: rated ? sum / rated : null,
    streak: longestStreak(scope.flatMap((l) => (l.watchedAt != null ? [l.watchedAt] : []))),
    oldest, newest,
    decades: [...decades].sort((a, b) => a[0] - b[0]).map(([dec, n]) => ({ label: `${dec}s`, n })),
  };
}

/** The slice of a TMDB title that the stats read. */
export interface StatTitle { type: MediaType; runtime: number | null; genres: string[]; directors: { id: number; name: string }[]; /** Series only: the summed episodes, when they could be looked up. */ time?: SeriesTime | null }
/** What the aired episodes of one series add up to. `guessed` episodes had no runtime of their own and were given the show's usual length; `missing` had neither and are not in `minutes`. */
export interface SeriesTime { minutes: number; episodes: number; guessed: number; missing: number }

/** Adds up a series from its episode list: only episodes that have aired by `today` (YYYY-MM-DD), each at its own TMDB runtime. */
export function sumEpisodes(eps: { air: string | null; runtime: number | null }[], typical: number | null, today: string): SeriesTime {
  const r: SeriesTime = { minutes: 0, episodes: 0, guessed: 0, missing: 0 };
  for (const e of eps) {
    if (!e.air || e.air > today) continue;
    r.episodes++;
    if (e.runtime && e.runtime > 0) r.minutes += e.runtime;
    else if (typical && typical > 0) { r.minutes += typical; r.guessed++; }
    else r.missing++;
  }
  return r;
}

export interface Director { id: number; name: string; n: number }
export interface TmdbStats {
  /** Minutes watched: film runtimes plus every aired episode of each watched series (`seriesMinutes` is the series share). */
  minutes: number; seriesMinutes: number; filmsTimed: number; filmsNoRuntime: number;
  seriesTimed: number; seriesUntimed: number; episodes: number; guessedEpisodes: number; missingEpisodes: number;
  genres: Counted[]; directors: Director[];
}

/** Most recent first, capped: the titles whose details are looked up. Titles without a watch date come last. */
export function recentWatched(items: LibItem[], cap: number): LibItem[] {
  return [...items].sort((a, b) => (b.watchedAt ?? -1) - (a.watchedAt ?? -1)).slice(0, cap);
}

export function tmdbStats(titles: StatTitle[], top = 8): TmdbStats {
  let minutes = 0, seriesMinutes = 0, filmsTimed = 0, filmsNoRuntime = 0, seriesTimed = 0, seriesUntimed = 0, episodes = 0, guessedEpisodes = 0, missingEpisodes = 0;
  const genres = new Map<string, number>(), dirs = new Map<number, Director>();
  for (const t of titles) {
    if (t.type === "tv") {
      if (t.time && t.time.episodes > 0) {
        seriesTimed++; seriesMinutes += t.time.minutes; minutes += t.time.minutes;
        episodes += t.time.episodes; guessedEpisodes += t.time.guessed; missingEpisodes += t.time.missing;
      } else seriesUntimed++;
    }
    else if (t.runtime && t.runtime > 0) { minutes += t.runtime; filmsTimed++; }
    else filmsNoRuntime++;
    for (const g of new Set(t.genres)) genres.set(g, (genres.get(g) ?? 0) + 1);
    if (t.type === "movie") for (const p of t.directors) dirs.set(p.id, { ...p, n: (dirs.get(p.id)?.n ?? 0) + 1 });
  }
  return {
    minutes, seriesMinutes, filmsTimed, filmsNoRuntime, seriesTimed, seriesUntimed, episodes, guessedEpisodes, missingEpisodes,
    genres: [...genres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top).map(([label, n]) => ({ label, n })),
    // One film by someone is not "most watched": only directors seen at least twice.
    directors: [...dirs.values()].filter((p) => p.n > 1).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, top),
  };
}

/** "126 h" or "126 h · 5.3 days". */
export function formatHours(minutes: number): string {
  const h = Math.round(minutes / 60);
  return h >= 48 ? `${h} h · ${(minutes / 1440).toFixed(1)} days` : `${h} h`;
}
