"use client";
import { useCallback, useEffect, useRef } from "react";
import { setProgress } from "@/app/actions";
import { useLib } from "../cast/LibState";
import { shouldSavePlace } from "@/lib/watch-library";
import type { MediaType } from "@/lib/types";
import type { Pos } from "@/lib/who-types";

const DELAY = 800;

/**
 * Saves the place to the library while the title is Watching there: ONE debounced write (800 ms after the last change), flushed when the page
 * is hidden or closed. Titles that are not Watching (you are just looking) are never written. Returns the function to call on every place change.
 */
export function useSavedPlace(key: string, type: MediaType, id: number): (p: Pos) => void {
  const lib = useLib();
  const status = lib.get(key)?.status;
  const statusRef = useRef(status); statusRef.current = status;
  const touch = useRef(lib.touch); touch.current = lib.touch;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<{ s: number; e: number } | null>(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) setProgress(type, id, p.s, p.e).then(() => touch.current()).catch(() => { /* a place is a convenience: the next change tries again */ });
  }, [type, id]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  return useCallback((p: Pos) => {
    if (!shouldSavePlace(statusRef.current, type, p)) { pending.current = null; clearTimeout(timer.current); return; }
    pending.current = { s: p.s, e: p.e };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, DELAY);
  }, [type, flush]);
}
