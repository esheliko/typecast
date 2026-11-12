import type { Pos } from "./who-types";
import type { MediaType, Priority, Status } from "./types";
import type { Watch, WatchPrev } from "./watching";
import { prevEpisode } from "./episodes";

/**
 * How "Watching now" meets the library. Pure decisions only (unit tested); the components do the writes through LibProvider and `setProgress`.
 * Only the explicit "I'm watching this now" button counts as intent: opening /watching, searching and moving the pickers never write anything.
 */

type Current = { status: Status; priority: Priority } | null | undefined;

/** Starting a watch: a title that is missing, on the Watchlist or Partly watched becomes Watching (remembering what it was). Watching and Watched stay as they are. */
export function startPlan(cur: Current, type: MediaType, place: { s: number; e: number } | null): { promote: false } | { promote: true; prev: WatchPrev } {
  if (cur && (cur.status === "watching" || cur.status === "watched")) return { promote: false };
  const st: WatchPrev["st"] = !cur ? "none" : cur.status === "partial" ? "partial" : cur.priority === "must" ? "must" : "watchlist";
  const prev: WatchPrev = { st };
  if (type === "tv" && place && place.s >= 1 && place.e >= 1) { prev.s = place.s; prev.e = place.e; }
  return { promote: true, prev };
}

export type RestorePlan = { do: "nothing" } | { do: "set"; status: Status; priority: Priority } | { do: "remove" };

/**
 * "Stop watching": put the status back, but only when this watch promoted the title and it is still Watching. A title that was not in the
 * library is removed again only when nothing was added meanwhile: no place beyond the one saved at the start, no rating or note.
 */
export function restorePlan(w: Pick<Watch, "prev" | "type" | "s" | "e">, cur: { status: Status; rich: boolean } | null | undefined): RestorePlan {
  const prev = w.prev;
  if (!prev || !cur || cur.status !== "watching") return { do: "nothing" };
  if (prev.st === "partial") return { do: "set", status: "partial", priority: "someday" };
  if (prev.st === "watchlist") return { do: "set", status: "watchlist", priority: "someday" };
  if (prev.st === "must") return { do: "set", status: "watchlist", priority: "must" };
  if (cur.rich) return { do: "nothing" };
  if (w.type === "tv" && (w.s !== prev.s || w.e !== prev.e)) return { do: "nothing" };
  return { do: "remove" };
}

type Ep = { s: number; e: number };
type SeasonCount = { n: number; eps: number };

/**
 * ONE explicit mapping between the two meanings of "where you are".
 * - Page place (s, e): the episode being watched NOW (what /watching, the watch cookie and the pickers hold).
 * - Library progress (`progress_season/progress_episode`): "watched up to and including this episode" (`upTo`, `seenIn`, "Watched up to here").
 * So progress is the episode BEFORE the place, and the place to continue with is the episode AFTER the progress.
 */

/** Library progress to write for a page place: the episode before it. null = nothing to write (S1 E1, or a place whose previous episode is unknown, or specials). */
export function placeToProgress(place: Ep | null | undefined, seasons: readonly SeasonCount[] = []): Ep | null {
  if (!place || !(place.s >= 1) || !(place.e >= 1)) return null;
  if (place.e > 1) return { s: place.s, e: place.e - 1 };
  return prevEpisode(place, seasons.map((x) => ({ n: x.n, eps: x.eps })));
}

/**
 * The page place to continue with for saved library progress: the episode after it. With season sizes it rolls into the next season after a season's last
 * episode (and stays on the last episode when nothing follows); without them it is simply the next number (the page normalises it with `normalizePlace`).
 */
export function continuePlace(progress: Ep | null | undefined, seasons?: readonly SeasonCount[]): Ep | null {
  if (!progress || !(progress.s >= 1) || !(progress.e >= 1)) return null;
  const next = { s: progress.s, e: progress.e + 1 };
  return seasons ? normalizePlace(next, seasons, true) : next;
}

/** A place past the end of its season rolls to the first episode of the next season that has episodes; with `keepLast` and no later season it falls back to the season's last episode. */
export function normalizePlace(p: Ep, seasons: readonly SeasonCount[], keepLast = false): Ep {
  const cur = seasons.find((x) => x.n === p.s);
  if (!cur || cur.eps <= 0 || p.e <= cur.eps) return p;
  const later = seasons.filter((x) => x.n > p.s && x.eps > 0).sort((a, b) => a.n - b.n)[0];
  if (later) return { s: later.n, e: 1 };
  return keepLast ? { s: cur.n, e: cur.eps } : p;
}

/** 1-based position of an episode in the whole series (specials not counted), or null when it cannot be told. */
export function episodeOrdinal(p: Ep, seasons: readonly SeasonCount[]): number | null {
  if (!(p.s >= 1) || !(p.e >= 1)) return null;
  let n = 0;
  for (const x of seasons) if (x.n >= 1 && x.n < p.s) n += x.eps;
  return n + p.e;
}

/** Is `a` strictly after `b`? A missing `b` (no progress) is before everything. */
export const isAhead = (a: Ep, b: Ep | null | undefined) => !b || a.s > b.s || (a.s === b.s && a.e > b.e);

/**
 * FORWARD-ONLY autosave: the progress to write when the place moves to `place`, or null (nothing). Only a progress strictly beyond the saved one is written, so
 * checking an earlier episode's cast never rolls progress back. `jump` is true when the move is more than one episode ahead of the saved place (the page then
 * says "Place saved"); a single step is silent.
 */
export function forwardSave(place: Ep | null, saved: Ep | null, seasons: readonly SeasonCount[]): { write: Ep; jump: boolean } | null {
  const write = placeToProgress(place, seasons);
  if (!write || !isAhead(write, saved)) return null;
  const from = continuePlace(saved, seasons) ?? { s: 1, e: 1 };
  const a = episodeOrdinal(place!, seasons), b = episodeOrdinal(from, seasons);
  return { write, jump: a != null && b != null ? a - b > 1 : (place!.s !== from.s || place!.e - from.e > 1) };
}

/**
 * What "Next" saves: the episode you were on is now watched. Written only when it is beyond the saved progress; a Watched title (rewatch) keeps its status and
 * is only ever moved forward from an existing progress (no progress on a Watched title means "all of it", which a place must not narrow).
 */
export function nextWrite(status: Status | undefined, from: Ep | null, saved: Ep | null): Ep | null {
  if (!from || !(from.s >= 1) || !(from.e >= 1)) return null;
  if (status === "watched" && !saved) return null;
  return isAhead(from, saved) ? from : null;
}

/** The first and last episodes of a series in season order (specials excluded), for "was that the last episode?". */
export function isLastEpisode(p: Ep, seasons: readonly SeasonCount[]): boolean {
  const real = seasons.filter((x) => x.n >= 1 && x.eps > 0).sort((a, b) => a.n - b.n);
  const last = real[real.length - 1];
  return !!last && p.s === last.n && p.e >= last.eps;
}

/** TMDB says the series is over (Ended or Canceled), so finishing its last episode can offer "Mark the series watched". */
export const seriesEnded = (status: string) => status === "Ended" || status === "Canceled";

/** Does a promoting signal ("I am watching this") need to move the title to Watching? Same rule as the start button. */
export const needsPromotion = (cur: Current) => !cur || cur.status === "watchlist" || cur.status === "partial";

/** The film clock has reached the runtime: time for the quiet "Finished?" prompt. */
export const filmDone = (elapsedMin: number, runtime: number | null) => !!runtime && runtime > 0 && elapsedMin >= runtime;

/* ---------- partly-origin promotions revert after inactivity (device-local, best effort) ---------- */

export const REVERT_AFTER_MS = 12 * 3600 * 1000;
export const REVERT_DROP_MS = 30 * 24 * 3600 * 1000;
export interface PrevRecord { prev: "partial"; lastActive: number }

/** What to do with a stored `typecast.watchPrev.<key>` record on app load: put the title back, forget the record, or leave it. */
export function revertDecision(rec: PrevRecord, o: { now: number; activeWatch: boolean; status: Status | undefined }): "revert" | "drop" | "keep" {
  if (o.activeWatch) return "keep";
  if (o.status !== "watching") return "drop";
  if (o.now - rec.lastActive > REVERT_DROP_MS) return "drop";
  return o.now - rec.lastActive > REVERT_AFTER_MS ? "revert" : "keep";
}

/** The page place to open a series at when the URL and the watch say nothing: the episode AFTER the saved progress (Watching, Partly, or Watched with progress; never To watch). */
export function resumePlace(item: { status: Status; progress: Ep | null } | null | undefined, seasons?: readonly SeasonCount[]): Ep | null {
  if (!item || item.status === "watchlist") return null;
  return continuePlace(item.progress, seasons);
}

/** Where /watching opens a series: the URL says so, else this device's watch, else the library's saved place, else not set. */
export function openingPos(urlHasPlace: boolean, fromUrl: Pos, watchPos: Pos | null, saved: { s: number; e: number } | null): Pos {
  if (urlHasPlace) return fromUrl;
  if (watchPos) return watchPos;
  return saved ? { s: saved.s, e: saved.e } : { s: null, e: null };
}

/** Whether a place change may be written to the library: only while the title is Watching there, and only for an exact episode. */
export function shouldSavePlace(status: Status | undefined, type: MediaType, p: Pos): p is { s: number; e: number } {
  return status === "watching" && type === "tv" && p.s != null && p.s > 0 && p.e != null && p.e > 0;
}

export interface ResumeCard { key: string; title: string; poster: string | null; place: string | null; href: string }
interface ResumeRow { key: string; type: MediaType; title: string; poster: string | null; status: Status; progress: { s: number; e: number } | null; updated: number }

/** "Pick up where you left off": the Watching titles, most recently updated first, as links that reopen /watching at the saved place. */
export function pickUpCards(rows: readonly ResumeRow[], max = 6): ResumeCard[] {
  return rows.filter((r) => r.status === "watching").sort((a, b) => b.updated - a.updated).slice(0, max).map((r) => {
    const k = r.key.replace(":", "-");
    const p = r.type === "tv" ? resumePlace(r) : null;
    return { key: r.key, title: r.title, poster: r.poster, place: p ? `S${p.s} E${p.e}` : null, href: `/watching?k=${k}${p ? `&s=${p.s}&e=${p.e}` : ""}` };
  });
}

/** The title switcher on /watching: the OTHER Watching titles (never the one on the page), same shape and order as `pickUpCards`. Title, poster and place only: nothing that could spoil. */
export function switchCards(rows: readonly ResumeRow[], currentKey: string, max = 6): ResumeCard[] {
  return pickUpCards(rows.filter((r) => r.key !== currentKey), max);
}
