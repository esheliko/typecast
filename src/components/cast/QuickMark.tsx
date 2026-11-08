"use client";
import { useLib } from "./LibState";
import StatusIcon from "./StatusIcon";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/types";
import type { Item } from "@/lib/types";

/**
 * Three one-tap toggles: Watching (in progress), To watch and Watched.
 * To watch is a single button: it adds the title at your default priority (Some day or Must watch, chosen in Profile),
 * shows the matching icon, and the confirmation offers to switch to the other priority.
 */
export default function QuickMark({ it, variant = "over", quiet }: { it: Item; variant?: "over" | "inline"; quiet?: boolean }) {
  const { get, mark, defaultPriority } = useLib();
  const m = get(it.key);
  const s = m?.status;
  const partial = s === "partial";
  const inProgress = s === "watching" || partial;
  const onList = s === "watchlist";
  const prio = onList ? m?.priority ?? "someday" : defaultPriority;
  const must = prio === "must";
  return (
    // Pressing a mark button must not take focus from whatever has it (e.g. the search box), so you can search, mark, search again.
    <div className={`qm ${variant}`} role="group" aria-label={`Mark ${it.title}`} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" className="qm-b watching" aria-pressed={inProgress} onClick={() => mark(it, inProgress ? null : "watching", undefined, quiet)}
        aria-label={inProgress ? `${partial ? STATUS_LABEL.partial : STATUS_LABEL.watching}. Tap to remove` : `Mark ${STATUS_LABEL.watching}`} title={partial ? STATUS_LABEL.partial : STATUS_LABEL.watching}>
        <StatusIcon kind={partial ? "partial" : "watching"} />
      </button>
      <button type="button" className={`qm-b ${must ? "must" : "watchlist"}`} aria-pressed={onList} onClick={() => (onList ? mark(it, null, undefined, quiet) : mark(it, "watchlist", defaultPriority, quiet))}
        aria-label={onList ? `${STATUS_LABEL.watchlist}: ${PRIORITY_LABEL[prio]}. Tap to remove` : `${STATUS_LABEL.watchlist}: ${PRIORITY_LABEL[prio]}`} title={`${STATUS_LABEL.watchlist}: ${PRIORITY_LABEL[prio]}`}>
        <StatusIcon kind={must ? "must" : "watchlist"} />
      </button>
      <button type="button" className="qm-b watched" aria-pressed={s === "watched"} onClick={() => mark(it, s === "watched" ? null : "watched", undefined, quiet)}
        aria-label={s === "watched" ? `${STATUS_LABEL.watched}. Tap to remove` : `Mark ${STATUS_LABEL.watched}`} title={STATUS_LABEL.watched}>
        <StatusIcon kind="watched" />
      </button>
    </div>
  );
}
