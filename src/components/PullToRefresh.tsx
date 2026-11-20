"use client";
import { useEffect, useRef, useState } from "react";

const TRIGGER = 70; // px of (damped) pull that counts as "refresh"

/** An installed iPhone app has no browser chrome: no reload button and no pull-to-refresh. Add the pull gesture, in standalone mode only (Safari has its own). */
export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cur = useRef(0);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    const blocked = (t: EventTarget | null) => {
      if ((t as HTMLElement | null)?.closest?.(".toast")) return true; // a toast is dragged down to dismiss it
      if (document.querySelector(".modal, .gl-wrap")) return true; // a popup/sheet is open: it scrolls on its own
      for (let el = t as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
        if (el.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 && !blocked(e.target) ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { start.current = null; cur.current = 0; setPull(0); return; }
      cur.current = Math.min(dy * 0.5, 110);
      setPull(cur.current);
    };
    const onEnd = () => {
      const go = start.current !== null && cur.current >= TRIGGER;
      start.current = null; cur.current = 0;
      if (go) { setBusy(true); setPull(TRIGGER); location.reload(); } else setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (pull <= 0 && !busy) return null;
  return (
    <div className="ptr" aria-hidden style={{ transform: `translateY(${pull - 36}px)`, opacity: Math.min(pull / TRIGGER, 1) }}>
      <span className={busy || pull >= TRIGGER ? "spin" : "ptr-arrow"} style={busy ? undefined : { transform: `rotate(${pull >= TRIGGER ? 180 : 0}deg)` }} />
    </div>
  );
}
