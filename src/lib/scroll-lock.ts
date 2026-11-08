"use client";

/**
 * Shared page scroll lock for popups. Each popup used to save and restore `body.style.overflow` itself, so when popups closed out of
 * order (the import review closing after a revert while a title popup unwound, say) a stale "hidden" was written back and the page
 * under them could no longer scroll. A counter makes the order irrelevant: the page unlocks when the last popup lets go.
 */
let locks = 0;
let original = "";

/** Lock page scroll; returns the function that releases this lock (safe to call more than once). */
export function lockScroll(): () => void {
  if (locks === 0) { original = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = original;
  };
}
