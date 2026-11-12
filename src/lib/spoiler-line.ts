import { inScope } from "./who-scope";
import type { Appearances, Episode, Status } from "./types";
import type { Pos } from "./who-types";

/**
 * The spoiler line of one title: "a saved place in each title is that title's spoiler line, everywhere". Pure (unit tested in
 * tests/unit/spoiler-line.test.ts); the server asks it through `spoiler-line-data.ts`, the browser through the markers the routes return.
 * Details: docs/features/spoilers.md.
 *
 *   none          nothing is held back: not a series Watching in the library (Watchlist, Watched, Partly, not saved, a film), or lifted
 *   upto {s, e}   Watching with a saved place: episodes up to and INCLUDING (s, e) may be told; the episode after it stays hidden
 *   series-only   Watching with no saved place: series-level facts only (no episode details, plots, later seasons, character fates)
 */
export type SpoilerLine = { kind: "none" } | { kind: "upto"; s: number; e: number } | { kind: "series-only" };

/** What the library says about the title the data is about. */
export interface LineMark { status: Status; progress: { s: number; e: number } | null }

export interface LineContext {
  /** The title the /watching page is about. That title is governed by the page (its own position and No spoilers switch), so it has no library line. */
  page?: { key: string; spoilersShown: boolean } | null;
  /** The reader pressed Show for THIS view. Never remembered, never changes the saved place. */
  revealed?: boolean;
}

export const NONE: SpoilerLine = { kind: "none" };

export function spoilerLine(key: string, mark: LineMark | null | undefined, ctx: LineContext = {}): SpoilerLine {
  if (ctx.revealed) return NONE;
  if (!key.startsWith("tv:")) return NONE;
  if (ctx.page && ctx.page.key === key) return NONE;
  if (!mark || mark.status !== "watching") return NONE;
  const p = mark.progress;
  return p && p.s >= 1 && p.e >= 1 ? { kind: "upto", s: p.s, e: p.e } : { kind: "series-only" };
}

export const isHidden = (l: SpoilerLine): boolean => l.kind !== "none";

/** May this episode be told? Specials (season 0) are only told when nothing is held back. */
export function allowsEpisode(l: SpoilerLine, s: number, e: number): boolean {
  if (l.kind === "none") return true;
  if (l.kind === "series-only") return false;
  return s >= 1 && inScope(s, e, { s: l.s, e: l.e });
}

/** May this season be mentioned (its episodes, counts, air dates)? Up to and including the season the place is in. */
export function allowsSeason(l: SpoilerLine, n: number): boolean {
  if (l.kind === "none") return true;
  if (l.kind === "series-only") return false;
  return n >= 1 && n <= l.s;
}

/** Keep what the line allows (episodes carrying `s` and `e`). */
export const clipEpisodes = <T extends { s: number; e: number }>(eps: T[], l: SpoilerLine): T[] => (l.kind === "none" ? eps : eps.filter((x) => allowsEpisode(l, x.s, x.e)));
export const clipSeasonList = (seasons: number[], l: SpoilerLine): number[] => (l.kind === "none" ? seasons : seasons.filter((n) => allowsSeason(l, n)));

/** The line as a position for code that already takes one (`inScope`, `spanFromEpisodes`). "nothing" is its own value: a null position means everything. */
export type Clip = Pos | "nothing" | null;
export function clipPosOf(l: SpoilerLine): Clip {
  return l.kind === "none" ? null : l.kind === "upto" ? { s: l.s, e: l.e } : "nothing";
}

/** "Spoilers hidden for The Rookie". */
export const labelOf = (l: SpoilerLine, title: string): string => (l.kind === "none" ? "" : `Spoilers hidden for ${title}`);

/** What the routes put in their JSON so a screen can draw the gate: the line, never anything that was held back. */
export type HiddenLine = { kind: "upto"; s: number; e: number } | { kind: "series-only" };
export const hiddenOf = (l: SpoilerLine): HiddenLine | undefined => (l.kind === "none" ? undefined : l.kind === "upto" ? { kind: "upto", s: l.s, e: l.e } : { kind: "series-only" });

/** "up to S2 E8", or "" for series-only: the way a gate says how far the saved place goes. */
export const hiddenNote = (h: HiddenLine | null | undefined): string => (h?.kind === "upto" ? `up to S${h.s} E${h.e}` : "");

/* ---------- the request parameters (the page's key and switch, and a per-view Show) ---------- */

/** "tv-79744" and "tv:79744" are the same title. */
const colon = (k: string) => k.replace("-", ":");

/** `pg=<page title key>&ps=1` (the page's spoilers are shown) and `reveal=1`, as the routes read them. */
export function lineContextFrom(get: (name: string) => string | null | undefined, legacyFull = false): LineContext {
  const pg = (get("pg") ?? "").trim();
  return {
    ...(/^(movie|tv)[-:]\d{1,9}$/.test(pg) ? { page: { key: colon(pg), spoilersShown: get("ps") === "1" } } : {}),
    revealed: get("reveal") === "1" || legacyFull,
  };
}

/** The same fields for the browser to send. Empty when there is nothing to say. */
export function lineParams(c: { page?: { key: string; spoilersShown: boolean } | null; reveal?: boolean }): Record<string, string> {
  return { ...(c.page ? { pg: c.page.key.replace(":", "-"), ...(c.page.spoilersShown ? { ps: "1" } : {}) } : {}), ...(c.reveal ? { reveal: "1" } : {}) };
}

/** One string for a client cache: the same request with a different page, switch or Show is a different answer. */
export function lineCacheKey(c: { page?: { key: string; spoilersShown: boolean } | null; reveal?: boolean }): string {
  return `${c.page ? `${c.page.key}${c.page.spoilersShown ? "+" : "-"}` : "."}${c.reveal ? "!" : ""}`;
}

/** Which keys a per-row `reveal` covers: `reveal=1` is every key asked for, otherwise the list ("tv:1,tv:2"). */
export function revealedKeys(v: string | null | undefined, asked: string[]): Set<string> {
  if (!v) return new Set();
  if (v === "1") return new Set(asked);
  return new Set(v.split(",").map(colon).filter((k) => asked.includes(k)));
}

/* ---------- holding data back (the routes call these; hidden rows keep their number and air date only) ---------- */

export type HeldEpisode = Episode & { hidden?: true };

/** A season's episodes under the line: later ones keep S/E, air date and runtime, and lose their name, plot, still, crew, guests, rating and finale flag. */
export function holdBackSeason<T extends { name: string; air: string; episodes: Episode[] }>(season: T, l: SpoilerLine): Omit<T, "episodes"> & { episodes: HeldEpisode[]; hidden?: HiddenLine } {
  if (l.kind === "none") return season;
  const episodes = season.episodes.map((x): HeldEpisode => allowsEpisode(l, x.s, x.e) ? x
    : { s: x.s, e: x.e, name: "", air: x.air, runtime: x.runtime, rating: 0, votes: 0, overview: "", still: null, directors: [], writers: [], guests: [], hidden: true });
  return { ...season, episodes, hidden: hiddenOf(l) };
}

/**
 * Where an actor appears in a series, under the line: only episodes and seasons up to and including the saved place. Later ones are dropped, not listed,
 * because that someone shows up in a later episode is itself the spoiler. Counts that give the shape of the series away ("every episode (62)") go too.
 */
export function holdBackAppearances(a: Appearances, l: SpoilerLine): Appearances {
  if (l.kind === "none") return a;
  const episodes = clipEpisodes(a.episodes, l);
  return { roles: a.roles.map((r) => ({ role: r.role, eps: 0 })), total: episodes.length, episodes, seasons: clipSeasonList(a.seasons, l), showEpisodes: 0, hidden: hiddenOf(l) };
}

/** A series' facts under the line: no end date, no status, and only the seasons up to the saved place (the /api/who/title brief). */
export function holdBackBrief<T extends { last: string; status: string; seasons: { n: number }[] }>(b: T, l: SpoilerLine): T {
  return l.kind === "none" ? b : { ...b, last: "", status: "", seasons: b.seasons.filter((x) => allowsSeason(l, x.n)) };
}
