import type { MediaType } from "./types";

/**
 * "Watching now": the one title the user is in the middle of right now. Kept in a cookie (this device, ends by itself
 * after 12 hours; the title's status and place also live in the library, see lib/watch-library.ts) so the layout can draw the Watching-now bar without waiting on anything, and the Ask sheet knows how far in they are.
 */
export const WATCH_COOKIE = "tc_watch";
export const WATCH_MAX_MS = 12 * 3600 * 1000;

/**
 * What the title was in the library before this watch promoted it to Watching: "none" (not in the library), "watchlist", "must"
 * (Watchlist, Must watch) or "partial". For a series, `s`/`e` are the place saved when the watch started. Only set when the watch changed the status.
 */
export interface WatchPrev { st: "none" | "watchlist" | "must" | "partial"; s?: number; e?: number }
const PREV_ST = ["none", "watchlist", "must", "partial"] as const;

export interface Watch {
  key: string; type: MediaType; id: number; title: string; year: string; poster: string | null;
  /** When the watch started (ms). Moved by the "I'm further in / not as far" buttons, so elapsed time stays right after a pause. */
  started: number;
  /** Runtime in minutes (per episode for a series), when known. */
  runtime: number | null;
  /** When the watch was paused (ms). While set, the minutes stand still; resuming moves `started` forward by the paused time. */
  paused?: number;
  /** Series only: the episode being watched. */
  s?: number; e?: number;
  /**
   * Set by the /who page when the position is not an exact episode ("season 2, episode not sure", "season not sure", specials). `s` and `e` then hold the
   * nearest exact guess (1 for an unknown part) so the older sheet keeps working; /who reads `pos` first. The older sheet clears it when it sets an episode.
   */
  pos?: { s: number | null; e: number | null };
  /** Set only when starting this watch moved the title to Watching: how it stood before, so "Stop watching" can put it back. */
  prev?: WatchPrev;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);

/** Reads a stored watch, or null when it is missing, malformed or older than 12 hours. */
export function parseWatch(raw: string | undefined | null, now = Date.now()): Watch | null {
  if (!raw) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw.startsWith("%7B") ? decodeURIComponent(raw) : raw); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const type = j.type === "movie" || j.type === "tv" ? j.type : null;
  const id = int(j.id), started = int(j.started);
  if (!type || !id || !started || now - started > WATCH_MAX_MS || started > now + 60_000) return null;
  const w: Watch = { key: `${type}:${id}`, type, id, title: str(j.title, 200), year: str(j.year, 4), poster: str(j.poster, 120) || null, started, runtime: int(j.runtime) || null };
  const paused = int(j.paused);
  if (paused && paused >= started && paused <= now + 60_000) w.paused = paused;
  if (type === "tv") {
    w.s = int(j.s) || 1; w.e = int(j.e) || 1;
    const p = j.pos as Record<string, unknown> | undefined;
    if (p && typeof p === "object") {
      const n = (v: unknown) => (v === null ? null : typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000 ? v : undefined);
      const ps = n(p.s), pe = n(p.e);
      if (ps !== undefined && pe !== undefined && (ps !== null || pe === null)) w.pos = { s: ps, e: ps === null ? null : pe };
    }
  }
  const pv = j.prev as Record<string, unknown> | undefined;
  if (pv && typeof pv === "object" && PREV_ST.includes(pv.st as WatchPrev["st"])) {
    const place = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v < 1000 ? v : undefined);
    const ps = place(pv.s), pe = place(pv.e);
    const prev: WatchPrev = { st: pv.st as WatchPrev["st"] };
    if (type === "tv" && ps !== undefined && pe !== undefined) { prev.s = ps; prev.e = pe; }
    w.prev = prev;
  }
  return w;
}

export const serializeWatch = (w: Watch) => encodeURIComponent(JSON.stringify(w));

/** Whole minutes since the watch started, never negative. */
export const elapsedMin = (w: Pick<Watch, "started" | "paused">, now = Date.now()) => Math.max(0, Math.floor(((w.paused ?? now) - w.started) / 60000));

/** The watch with its clock stopped, or running again (the paused time is taken off the elapsed time). */
export const setPaused = (w: Watch, pause: boolean, now = Date.now()): Watch => {
  if (pause) return w.paused ? w : { ...w, paused: now };
  if (!w.paused) return w;
  const { paused, ...rest } = w;
  return { ...rest, started: Math.min(now, w.started + (now - paused)) };
};

/** Moves how far in you are by `min` minutes (negative = less), never into the future and never below zero. */
export const shiftWatch = (w: Watch, min: number, now = Date.now()): Watch => ({ ...w, started: Math.min(w.paused ?? now, w.started - min * 60000) });

/** "S2 E5", "42 min in", "42 of 120 min". */
export function whereLabel(w: Watch, now = Date.now()): string {
  const m = elapsedMin(w, now);
  const t = (w.runtime ? `${Math.min(m, w.runtime)} of ${w.runtime} min` : `${m} min in`) + (w.paused ? " · paused" : "");
  return w.type === "tv" ? `S${w.s} E${w.e} · ${t}` : t;
}

/** Fact groups, in the order the title view shows them. */
export const FACT_GROUPS = ["The story", "Behind the scenes", "Verdict and viewing"] as const;
export type FactGroup = (typeof FACT_GROUPS)[number];

/** The facts offered under "About": a label, the group it sits in, and the question the built-in answer engine (lib/answer.ts) is given. */
export function factButtons(type: MediaType): { label: string; q: string; group: FactGroup }[] {
  const tv = type === "tv";
  return [
    { group: "The story", label: "Story so far", q: tv ? "Recap the story so far, up to this episode" : "Recap the story so far" },
    { group: "The story", label: tv ? "This episode" : "What it's about", q: tv ? "Which episode is this?" : "What is it about?" },
    { group: "The story", label: tv ? "Episodes left" : "How long is left", q: tv ? "How many episodes are left this season?" : "How much longer is it?" },
    ...(tv ? [] : [{ group: "The story" as const, label: "Post-credits scene?", q: "Is there a post-credits scene?" }]),
    { group: "Behind the scenes", label: "Who made it", q: "Who directed this?" },
    { group: "Behind the scenes", label: "Music", q: "Who did the music?" },
    { group: "Behind the scenes", label: "Where it was filmed", q: "Where was this filmed?" },
    { group: "Behind the scenes", label: "Based on a true story?", q: "Is this based on a true story?" },
    { group: "Behind the scenes", label: "Trivia", q: "Tell me some trivia" },
    { group: "Verdict and viewing", label: "Rating", q: "What is the rating?" },
    { group: "Verdict and viewing", label: "Awards", q: "Did it win any awards?" },
    { group: "Verdict and viewing", label: "Where to stream", q: "Where can I watch this?" },
  ];
}
