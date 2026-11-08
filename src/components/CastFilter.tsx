"use client";
import { useRef } from "react";

/** Filters the cast list below it by actor or character name. */
/** `total`: a series' full count, including the rows (li.extra) that only show when they match a search. */
export default function CastFilter({ children, total }: { children: React.ReactNode; total?: number }) {
  const box = useRef<HTMLDivElement>(null);
  function filter(v: string) {
    const q = v.trim().toLowerCase();
    box.current?.querySelectorAll<HTMLElement>("li.credit").forEach((li) => { li.hidden = q ? !(li.dataset.q ?? "").includes(q) : li.classList.contains("extra"); });
  }
  return (
    <div ref={box}>
      <input type="search" aria-label="Find an actor or character" placeholder={total ? `Find anyone of all ${total} who appeared` : "Find an actor or character"} onChange={(e) => filter(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      {children}
    </div>
  );
}
