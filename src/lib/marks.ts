import type { Mark, Priority, Status } from "./types";

/**
 * Marks for every library row are sent to the browser on every page, so they travel as four characters per title
 * (status, priority, rich, new-episode flag) instead of an object: about a third of the size for a large library.
 */
const STATUS: Record<Status, string> = { watching: "g", partial: "p", watchlist: "l", watched: "w" };
const STATUS_BACK = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k])) as Record<string, Status>;

export type PackedMarks = Record<string, string>;

export function packMark(m: Mark): string {
  return `${STATUS[m.status]}${m.priority === "must" ? "m" : "s"}${m.rich ? "r" : "-"}${m.fresh === "season" ? "S" : m.fresh === "episode" ? "E" : "-"}`;
}

export function unpackMarks(packed: PackedMarks): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const k of Object.keys(packed)) {
    const c = packed[k];
    out[k] = { status: STATUS_BACK[c[0]] ?? "watchlist", priority: (c[1] === "m" ? "must" : "someday") as Priority, rich: c[2] === "r", ...(c[3] === "S" ? { fresh: "season" as const } : c[3] === "E" ? { fresh: "episode" as const } : {}) };
  }
  return out;
}
