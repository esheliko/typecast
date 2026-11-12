import type { Status } from "@/lib/types";

/**
 * Display order of the statuses, by intent: To watch (future), Watching (now), then Watched and Partly watched as one
 * "past" pair. Display only: stored values, `?f=` URLs and every logic list (SEEN sets, ranking weights) are unchanged.
 */
export type StatusGroup = "future" | "now" | "past";
export const STATUS_ORDER: readonly Status[] = ["watchlist", "watching", "watched", "partial"];
export const STATUS_GROUP: Record<Status, StatusGroup> = { watchlist: "future", watching: "now", watched: "past", partial: "past" };

/** Library filter tabs: All first, then the statuses in intent order. */
export const LIBRARY_TAB_ORDER: readonly (Status | "all")[] = ["all", ...STATUS_ORDER];

/** Group of a tab for styling: "all" has none. `first` marks the first chip of the past pair (gets the small gap). */
export function tabGroup(k: Status | "all", i: number): { group: StatusGroup | null; pairStart: boolean } {
  if (k === "all") return { group: null, pairStart: false };
  const g = STATUS_GROUP[k];
  const prev = i > 0 ? LIBRARY_TAB_ORDER[i - 1] : null;
  return { group: g, pairStart: g === "past" && (prev === null || prev === "all" || STATUS_GROUP[prev] !== "past") };
}
