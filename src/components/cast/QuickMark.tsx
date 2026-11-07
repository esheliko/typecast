"use client";
import { useLib } from "./LibState";
import type { Item } from "@/lib/types";

const CHECK = <path d="M5 12.5l4.5 4.5L19 7.5" />;
const STAR = <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" />;
const SAVE = <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />;
const PLAY = <path d="M8 5.5v13l11-6.5z" />;

/**
 * Three one-tap toggles: Watching (in progress), To watch and Watched.
 * To watch is a single button: it adds the title at your default priority (Some day or Must watch, chosen in Profile),
 * shows the matching icon, and the confirmation offers to switch to the other priority.
 */
export default function QuickMark({ it, variant = "over", quiet }: { it: Item; variant?: "over" | "inline"; quiet?: boolean }) {
  const { get, mark, defaultPriority } = useLib();
  const m = get(it.key);
  const s = m?.status;
  const onList = s === "watchlist";
  const prio = onList ? m?.priority ?? "someday" : defaultPriority;
  const must = prio === "must";
  return (
    <div className={`qm ${variant}`} role="group" aria-label={`Mark ${it.title}`}>
      <button type="button" className="qm-b watching" aria-pressed={s === "watching"} onClick={() => mark(it, s === "watching" ? null : "watching", undefined, quiet)}
        aria-label={s === "watching" ? "In progress. Tap to remove" : "Mark in progress"} title="Watching now">
        <svg viewBox="0 0 24 24" aria-hidden="true">{PLAY}</svg>
      </button>
      <button type="button" className={`qm-b ${must ? "must" : "watchlist"}`} aria-pressed={onList} onClick={() => (onList ? mark(it, null, undefined, quiet) : mark(it, "watchlist", defaultPriority, quiet))}
        aria-label={onList ? `On your ${must ? "must-watch" : "some day"} list. Tap to remove` : `Add to ${must ? "must-watch" : "some day"} list`} title={must ? "Must watch" : "To watch some day"}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{must ? STAR : SAVE}</svg>
      </button>
      <button type="button" className="qm-b watched" aria-pressed={s === "watched"} onClick={() => mark(it, s === "watched" ? null : "watched", undefined, quiet)}
        aria-label={s === "watched" ? "Watched. Tap to remove" : "Mark watched"} title="Watched">
        <svg viewBox="0 0 24 24" aria-hidden="true">{CHECK}</svg>
      </button>
    </div>
  );
}
