"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const KEY = "tc:scroll";
const read = (): Record<string, number> => { try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (m: Record<string, number>) => { try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage blocked */ } };

/**
 * Remembers how far each page was scrolled and puts you back there when you return to it (from another tab, or Back),
 * instead of the top. The position is saved when you tap any link (before the new page resets the scroll) and while
 * scrolling; restoring waits for the page to be tall enough, since content streams in behind skeletons.
 * Title popups are skipped: they sit over the page and never move it.
 */
export default function ScrollKeeper() {
  const path = usePathname();

  useEffect(() => {
    const save = (always: boolean) => {
      if (location.pathname.startsWith("/title")) return;
      if (!always && window.scrollY <= 0) return;
      const m = read();
      m[location.pathname] = Math.round(window.scrollY);
      write(m);
    };
    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; save(false); }); };
    const onClick = () => save(true);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onClick);
    };
  }, []);

  useEffect(() => {
    if (path.startsWith("/title")) return;
    const target = read()[path];
    if (!target) return;
    let stop = false;
    const t0 = performance.now();
    const cancel = () => { stop = true; };
    window.addEventListener("wheel", cancel, { passive: true, once: true });
    window.addEventListener("touchstart", cancel, { passive: true, once: true });
    window.addEventListener("keydown", cancel, { once: true });
    const tick = () => {
      if (stop) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= target || performance.now() - t0 > 2500) {
        window.scrollTo(0, Math.min(target, Math.max(0, max)));
        if (max >= target) return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { stop = true; window.removeEventListener("wheel", cancel); window.removeEventListener("touchstart", cancel); window.removeEventListener("keydown", cancel); };
  }, [path]);

  return null;
}
