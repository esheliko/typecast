"use client";
import { useEffect } from "react";

// On phones the on-screen keyboard covers the bottom of the page. Publish its height as --kb (pages and sheets pad
// their bottom by it, so everything stays scrollable above the keyboard) and lift a focused field to the top of
// the visible area so the results that appear beneath it are in view.
export default function KeyboardAware() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty("--kb", kb > 80 ? `${kb}px` : "0px");
    };
    const lift = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea")) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        update();
        if (document.activeElement !== el) return;
        const top = Number.parseFloat(getComputedStyle(root).getPropertyValue("--top-h")) || 56;
        const r = el.getBoundingClientRect();
        // Only scroll when the field is low on screen, or the keyboard would hide what's below it.
        if (r.top > vv.height * 0.35 || r.top < top) el.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 350);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", lift);
    update();
    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", lift);
    };
  }, []);
  return null;
}
