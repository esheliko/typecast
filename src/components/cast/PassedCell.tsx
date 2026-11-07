"use client";
import { useEffect, useRef } from "react";
import { useLib } from "./LibState";
import { clearPassed, recordPassed } from "@/lib/passed";

/** Poster must be this much on screen, for this long, to count as having been looked at. A quick flick past does not count. */
const VISIBLE = 0.6;
const DWELL_MS = 500;

/** Pass-overs wait here briefly so a long scroll writes to storage once, not once per poster. */
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
function flush() { clearTimeout(flushTimer); flushTimer = undefined; if (pending.size) { const keys = [...pending]; pending.clear(); recordPassed(keys); } }
function queue(key: string) { pending.add(key); flushTimer ??= setTimeout(flush, 1500); }
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

/**
 * A Browse grid cell that notices when its poster was properly looked at and then scrolled away without being marked,
 * skipped or opened. Each such pass-over makes the title less likely to come back (see src/lib/passed.ts).
 */
export default function PassedCell({ k, track, children }: { k: string; track: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const { get, skipped } = useLib();
  const state = useRef({ get, skipped }); state.current = { get, skipped };
  const engaged = useRef(false);

  useEffect(() => {
    const el = ref.current; if (!el || !track) return;
    let timer: ReturnType<typeof setTimeout> | undefined, looked = false;
    const io = new IntersectionObserver(([e]) => {
      // `isIntersecting` stays true for any overlap, so judge by how much is showing.
      if (e.isIntersecting && e.intersectionRatio >= VISIBLE - 0.01) {
        if (!looked && !timer) timer = setTimeout(() => { looked = true; timer = undefined; }, DWELL_MS);
        return;
      }
      clearTimeout(timer); timer = undefined;
      if (looked) {
        looked = false;
        const s = state.current;
        if (!engaged.current && !s.get(k) && !s.skipped.has(k)) queue(k);
      }
    }, { threshold: VISIBLE });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [k, track]);

  // Opening, marking or skipping from this cell shows interest: wipe its history and do not count this view.
  const engage = () => { engaged.current = true; pending.delete(k); clearPassed(k); };
  return <li ref={ref} onClickCapture={engage}>{children}</li>;
}
