import type { LibItem } from "./types";

/**
 * Film resume: a film you are in the middle of keeps the minutes you got to (`library_items.stopped_min`, with the runtime at that moment in
 * `stopped_of`). Pure helpers only (unit tested); the film clock writes it (components/who/PositionControl.tsx), the Library row, the Resume sheet
 * and Watch next show it. Docs: docs/features/film-resume.md.
 */

/** The minutes a stopped time can hold: a whole number from 1 to the runtime (when known), else null (nothing to remember). */
export function cleanStopped(min: number | null | undefined, runtime: number | null | undefined): number | null {
  if (typeof min !== "number" || !Number.isFinite(min)) return null;
  let m = Math.floor(min);
  if (runtime && runtime > 0) m = Math.min(m, Math.floor(runtime));
  return m >= 1 ? m : null;
}

/** The runtime worth storing next to it: a positive whole number, else null. */
export const cleanRuntime = (r: number | null | undefined): number | null => (typeof r === "number" && Number.isFinite(r) && r >= 1 && r <= 1000 ? Math.floor(r) : null);

/** "52:00" for 52 minutes, "1:12:00" from an hour on (the film clock counts minutes, so seconds are always 00). */
export function clockLabel(min: number): string {
  const m = Math.max(0, Math.floor(min));
  const h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:00` : `${m}:00`;
}

/** "1h 48m", "2h", "48m". */
export function durLabel(min: number): string {
  const h = Math.floor(min / 60), m = Math.floor(min % 60);
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** "stopped at 52:00 of 1h 48m" (just "stopped at 52:00" when the runtime is not known). */
export const stoppedLabel = (min: number, runtime: number | null) => `stopped at ${clockLabel(min)}${runtime ? ` of ${durLabel(runtime)}` : ""}`;

/** "52:00 of 1h 48m" (Watch next's line; "52:00 in" without a runtime). */
export const stoppedShort = (min: number, runtime: number | null) => (runtime ? `${clockLabel(min)} of ${durLabel(runtime)}` : `${clockLabel(min)} in`);

/** How far along, 0..100 (whole percent); 0 without a runtime. */
export const stoppedPct = (min: number, runtime: number | null) => (runtime && runtime > 0 ? Math.max(0, Math.min(100, Math.round((min / runtime) * 100))) : 0);

/** "56 min left" (never negative); null without a runtime. */
export const minutesLeft = (min: number, runtime: number | null) => (runtime && runtime > 0 ? Math.max(0, runtime - min) : null);

/** The Resume sheet's -5 / +5: moves by `by` minutes, never below 0 and never past the runtime (when known). */
export const nudge = (min: number, by: number, runtime: number | null) => Math.max(0, Math.min(runtime && runtime > 0 ? runtime : Infinity, min + by));

/** Whether a Library row / card for this film shows a Resume: a Watching film that has a stopped time. */
export const hasStopped = (l: Pick<LibItem, "type" | "status" | "stoppedMin">) => l.type === "movie" && l.status === "watching" && !!l.stoppedMin && l.stoppedMin > 0;

/**
 * What the film clock should save for the minutes it shows now: `{ min, of }` to write, or null for "nothing to write".
 * `last` is what it saved last (so an unchanged value is not written twice). A clock back at 0 clears the saved time (a restart).
 */
export function stoppedWrite(elapsed: number, runtime: number | null, last: number | null): { min: number | null; of: number | null } | null {
  const min = cleanStopped(elapsed, runtime);
  if (min === last) return null;
  return { min, of: min === null ? null : cleanRuntime(runtime) };
}
