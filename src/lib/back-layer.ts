"use client";
import { useEffect, useRef } from "react";

/**
 * Makes the browser / phone Back button close an open popup instead of leaving the page underneath.
 * While `open` is true the popup owns one extra history entry (same URL). Back pops that entry and the popup closes.
 * Closing it any other way (Close button, Esc, tap outside) removes the entry again so history stays tidy.
 * Stacked popups each own an entry; Back closes the top one first.
 */
type Layer = { close: () => void; popped: boolean };
const layers: Layer[] = [];
let skip = 0;       // popstates caused by our own history.back()
let keep = false;   // the next programmatic close must not touch history (the app is navigating away)
let bound = false;

function onPop() {
  if (skip > 0) { skip--; return; }
  const top = layers.pop();
  if (!top) return;
  top.popped = true;
  top.close();
}

/** Call right before closing a popup because a link inside it is navigating: history must be left alone. */
export function keepHistory() { keep = true; setTimeout(() => { keep = false; }, 0); }

export function useBackClose(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  useEffect(() => { cb.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const layer: Layer = { close: () => cb.current(), popped: false };
    let pushed = false;
    // Deferred so React strict mode's mount / unmount / mount probe never touches history.
    const t = setTimeout(() => {
      if (!bound) { window.addEventListener("popstate", onPop); bound = true; }
      layers.push(layer);
      window.history.pushState(window.history.state, "", window.location.href);
      pushed = true;
    }, 0);
    return () => {
      clearTimeout(t);
      if (!pushed || layer.popped) return;
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (keep) return;
      skip++;
      window.history.back();
    };
  }, [open]);
}
