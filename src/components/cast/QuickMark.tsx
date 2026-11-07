"use client";
import { useLib } from "./LibState";
import type { Item } from "@/lib/types";

const CHECK = <path d="M5 12.5l4.5 4.5L19 7.5" />;
const SAVE = <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />;

/** Two one-tap toggles: Watched and To watch. Tapping the lit one takes the title out of the library. */
export default function QuickMark({ it, variant = "over" }: { it: Item; variant?: "over" | "inline" }) {
  const { get, mark } = useLib();
  const s = get(it.key)?.status;
  return (
    <div className={`qm ${variant}`} role="group" aria-label={`Mark ${it.title}`}>
      <button type="button" className="qm-b watched" aria-pressed={s === "watched"} onClick={() => mark(it, s === "watched" ? null : "watched")}
        aria-label={s === "watched" ? "Watched. Tap to remove" : "Mark watched"} title="Watched">
        <svg viewBox="0 0 24 24" aria-hidden="true">{CHECK}</svg>
      </button>
      <button type="button" className="qm-b watchlist" aria-pressed={s === "watchlist"} onClick={() => mark(it, s === "watchlist" ? null : "watchlist")}
        aria-label={s === "watchlist" ? "On your list. Tap to remove" : "Add to watch list"} title="To watch">
        <svg viewBox="0 0 24 24" aria-hidden="true">{SAVE}</svg>
      </button>
    </div>
  );
}
