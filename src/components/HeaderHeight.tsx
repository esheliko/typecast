"use client";
import { useEffect } from "react";

// Publishes the real height of the sticky header as --top-h so sticky elements below it (the search box)
// sit exactly under it on every phone, whatever its safe-area inset or font scaling.
export default function HeaderHeight() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("header.top");
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--top-h", `${el.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    return () => { ro.disconnect(); window.removeEventListener("resize", set); };
  }, []);
  return null;
}
