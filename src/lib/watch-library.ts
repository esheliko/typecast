import type { Pos } from "./who-types";
import type { MediaType, Priority, Status } from "./types";
import type { Watch, WatchPrev } from "./watching";

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

/** The place saved in the library for a series, for opening /watching with no season and episode in the URL. Watchlist rows carry none. */
export function resumePlace(item: { status: Status; progress: { s: number; e: number } | null } | null | undefined): { s: number; e: number } | null {
  if (!item || item.status === "watchlist" || !item.progress) return null;
  const { s, e } = item.progress;
  return s >= 1 && e >= 1 ? { s, e } : null;
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
