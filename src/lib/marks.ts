import type { Mark, Priority, Status } from "./types";

/**
 * Marks for every library row are sent to the browser on every page, so they travel as four characters per title
 * (status, priority, rich, new-episode flag) instead of an object: about a third of the size for a large library.
 * A Watching series with a saved place adds `<season>.<episode>` after them (its spoiler line); a Watching film with a stopped time adds `t<minutes>` (its Resume point); a 4-character string has neither.
 */
const STATUS: Record<Status, string> = { watching: "g", partial: "p", watchlist: "l", watched: "w" };
const STATUS_BACK = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k])) as Record<string, Status>;

export type PackedMarks = Record<string, string>;

export function packMark(m: Mark): string {
  const p = m.status === "watching" && m.progress && m.progress.s >= 1 && m.progress.e >= 1 ? `${m.progress.s}.${m.progress.e}` : "";
  const t = m.status === "watching" && m.stopped && m.stopped >= 1 ? `t${Math.floor(m.stopped)}` : "";
  return `${STATUS[m.status]}${m.priority === "must" ? "m" : "s"}${m.rich ? "r" : "-"}${m.fresh === "season" ? "S" : m.fresh === "episode" ? "E" : "-"}${p}${t}`;
}

/** The saved place out of a packed mark's optional suffix; null when there is none (or it is malformed). */
export function unpackProgress(c: string): { s: number; e: number } | null {
  const m = /^(\d{1,4})\.(\d{1,4})$/.exec(c.slice(4));
  return m ? { s: +m[1], e: +m[2] } : null;
}

/** The stopped minutes out of a packed mark's optional `t<minutes>` suffix; undefined when there is none. */
export function unpackStopped(c: string): number | undefined {
  const m = /^t(\d{1,4})$/.exec(c.slice(4));
  return m && +m[1] >= 1 ? +m[1] : undefined;
}

export function unpackMarks(packed: PackedMarks): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const k of Object.keys(packed)) {
    const c = packed[k];
    const progress = unpackProgress(c), stopped = unpackStopped(c);
    out[k] = { status: STATUS_BACK[c[0]] ?? "watchlist", priority: (c[1] === "m" ? "must" : "someday") as Priority, rich: c[2] === "r", ...(c[3] === "S" ? { fresh: "season" as const } : c[3] === "E" ? { fresh: "episode" as const } : {}), ...(progress ? { progress } : {}), ...(stopped ? { stopped } : {}) };
  }
  return out;
}

/** The saved place a mark carries: only a Watching series has one (it is what `packMark` keeps). */
export const placeOf = (m: Mark | null | undefined): { s: number; e: number } | null => (m && m.status === "watching" && m.progress && m.progress.s >= 1 && m.progress.e >= 1 ? m.progress : null);

/** The stopped minutes a mark carries: only a Watching film has them (what `packMark` keeps). */
export const stoppedOf = (m: Mark | null | undefined): number | undefined => (m && m.status === "watching" && m.stopped && m.stopped >= 1 ? m.stopped : undefined);

/** Does the server's mark agree with a local override (status, priority and saved place)? Then the override has done its job. */
export function sameMark(a: Mark | null | undefined, b: Mark | null | undefined): boolean {
  const pa = placeOf(a), pb = placeOf(b);
  return (a?.status ?? null) === (b?.status ?? null) && a?.priority === b?.priority && pa?.s === pb?.s && pa?.e === pb?.e && stoppedOf(a) === stoppedOf(b);
}

/** The mark after the saved place moved to `place` (null clears it). `status` is what the library now holds when the write also changed it (an episode tick adds a series as Watching). Null when there is nothing to put it on. */
export function withPlace(m: Mark | null | undefined, place: { s: number; e: number } | null, status?: Status): Mark | null {
  const st = status ?? m?.status;
  if (!st) return null;
  return { status: st, priority: m?.priority ?? "someday", rich: m?.rich ?? false, ...(m?.fresh ? { fresh: m.fresh } : {}), progress: place, ...(m?.stopped ? { stopped: m.stopped } : {}) };
}

/** The mark after a film's stopped time moved to `min` (undefined clears it). Null when there is nothing to put it on. */
export function withStopped(m: Mark | null | undefined, min: number | undefined): Mark | null {
  if (!m) return null;
  const { stopped: _drop, ...rest } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
  return min ? { ...rest, stopped: min } : rest;
}
