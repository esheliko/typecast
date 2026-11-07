"use client";
import { useLib } from "./LibState";
import type { Item } from "@/lib/types";

const CHECK = <path d="M5 12.5l4.5 4.5L19 7.5" />;
const STAR = <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" />;
const SAVE = <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />;

/** One-tap toggles: Watched, To watch (some day) and Must watch. Tapping a lit Watched or To watch removes the title; tapping a lit Must watch drops it back to some day. */
export default function QuickMark({ it, variant = "over" }: { it: Item; variant?: "over" | "inline" }) {
  const { get, mark } = useLib();
  const m = get(it.key);
  const s = m?.status;
  const must = s === "watchlist" && m?.priority === "must";
  return (
    <div className={`qm ${variant}`} role="group" aria-label={`Mark ${it.title}`}>
      <button type="button" className="qm-b watched" aria-pressed={s === "watched"} onClick={() => mark(it, s === "watched" ? null : "watched")}
        aria-label={s === "watched" ? "Watched. Tap to remove" : "Mark watched"} title="Watched">
        <svg viewBox="0 0 24 24" aria-hidden="true">{CHECK}</svg>
      </button>
      <button type="button" className="qm-b watchlist" aria-pressed={s === "watchlist" && !must} onClick={() => mark(it, s === "watchlist" && !must ? null : "watchlist", "someday")}
        aria-label={s === "watchlist" && !must ? "On your list for some day. Tap to remove" : "Add to watch list for some day"} title="To watch some day">
        <svg viewBox="0 0 24 24" aria-hidden="true">{SAVE}</svg>
      </button>
      <button type="button" className="qm-b must" aria-pressed={must} onClick={() => mark(it, "watchlist", must ? "someday" : "must")}
        aria-label={must ? "On your must-watch list. Tap to move to some day" : "Add to must-watch list"} title="Must watch">
        <svg viewBox="0 0 24 24" aria-hidden="true">{STAR}</svg>
      </button>
    </div>
  );
}
