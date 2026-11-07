"use client";
import type { ReactNode } from "react";

/** A header chip that jumps to the Awards section, opening the award bodies it counts (`groups`) on the way. */
export function AwardChip({ groups, win, tip, children }: { groups: string[]; win: boolean; tip: string; children: ReactNode }) {
  const go = () => {
    // The popup is the last title view in the page, so take the last section if two exist.
    const sec = [...document.querySelectorAll<HTMLElement>("[data-aw-section]")].pop();
    if (!sec) return;
    for (const d of sec.querySelectorAll<HTMLDetailsElement>("details[data-aw]")) if (groups.includes(d.dataset.aw ?? "")) d.open = true;
    sec.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  return <button type="button" className={`aw-chip${win ? " win" : ""}`} title={`${tip}. Tap to see the awards`} onClick={go}>{children}</button>;
}
