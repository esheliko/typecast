"use client";
import { useCallback, useEffect, useRef } from "react";
import { clearProgress, setProgress } from "@/app/actions";
import { useLib } from "../cast/LibState";
import { useWatchControl } from "../Watching";
import { forwardSave, isAhead, needsPromotion, nextWrite, shouldSavePlace } from "@/lib/watch-library";
import { refreshPartly } from "@/lib/watch-prev";
import type { Item } from "@/lib/types";
import type { Pos } from "@/lib/who-types";

const DELAY = 800;
type Ep = { s: number; e: number };

/**
 * The /watching page's writes to the library. The page place is the episode being watched NOW; the library progress is the episode BEFORE it
 * (see `placeToProgress`), so nothing here ever marks the episode you are in the middle of.
 * - `place(p)`: the pickers. FORWARD-ONLY, only while the title is Watching, ONE debounced write (800 ms after the last change, flushed when the page is hidden).
 *   A jump of more than one episode ahead of the saved place says "Place saved: S3 E12 · Undo"; a single step is silent. Going back or staying saves nothing.
 * - `next(from, to)`: the Next button: `from` is now watched (one write), the title is moved to Watching if it was not, toast "S3 E8 marked watched · Undo".
 */
export function useSavedPlace(item: Item, runtime: number | null, seasons: { n: number; eps: number }[], savedProgress: Ep | null) {
  const lib = useLib();
  const wc = useWatchControl();
  const status = lib.get(item.key)?.status;
  const statusRef = useRef(status); statusRef.current = status;
  const live = useRef({ lib, wc, item, runtime, seasons }); live.current = { lib, wc, item, runtime, seasons };
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** What the library holds as progress, as far as this page knows (updated by its own writes; starts from the server's value). */
  const saved = useRef<Ep | null>(savedProgress);
  const pending = useRef<{ write: Ep; place: Ep; jump: boolean } | null>(null);

  const restore = useCallback((to: Ep | null) => {
    const { item: it, lib: l } = live.current;
    const prior = saved.current;
    saved.current = to;
    (to ? setProgress(it.type, it.id, to.s, to.e) : clearProgress(it.type, it.id))
      .then(() => l.touch()).catch(() => { saved.current = prior; });
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    const { item: it, lib: l } = live.current;
    const prior = saved.current;
    saved.current = p.write;
    setProgress(it.type, it.id, p.write.s, p.write.e).then(() => {
      l.touch(); refreshPartly(it.key);
      if (p.jump) l.notify(`Place saved: S${p.place.s} E${p.place.e}`, () => restore(prior));
    }).catch(() => { saved.current = prior; /* a place is a convenience: the next change tries again */ });
  }, [restore]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  const place = useCallback((p: Pos) => {
    if (!shouldSavePlace(statusRef.current, live.current.item.type, p)) return;
    const r = forwardSave({ s: p.s, e: p.e }, saved.current, live.current.seasons);
    // Going back (or staying) saves nothing; a write still waiting for its debounce only ever moves forward.
    if (!r || (pending.current && !isAhead(r.write, pending.current.write))) return;
    pending.current = { ...r, place: { s: p.s, e: p.e } };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, DELAY);
  }, [flush]);

  /** Next: `from` was finished. `to` is where the pickers go next (null on the very last episode). Call before the place state changes. */
  const next = useCallback((from: Ep, to: Ep | null) => {
    const { item: it, lib: l, wc: w, runtime: rt } = live.current;
    const cur = l.get(it.key);
    // A write the debounce still holds is for an episode before `from` (the place only moves forward from the page's own state), so this one replaces it.
    pending.current = null; clearTimeout(timer.current);
    const write = nextWrite(needsPromotion(cur) ? "watching" : cur?.status, from, saved.current);
    const prior = saved.current;
    if (write) saved.current = write;
    const engaged = w ? w.signal(it, rt, to ?? from) : Promise.resolve(true);
    engaged.then((ok) => {
      if (!ok) { saved.current = prior; return; }
      if (write) return setProgress(it.type, it.id, write.s, write.e).then(() => { l.touch(); l.notify(`S${from.s} E${from.e} marked watched`, () => restore(prior)); }).catch(() => { saved.current = prior; });
    }).catch(() => { saved.current = prior; });
    refreshPartly(it.key);
  }, [restore]);

  return { place, next };
}
