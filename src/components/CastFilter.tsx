"use client";
import { useRef } from "react";

/** Filters the cast list below it by actor or character name. */
export default function CastFilter({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  function filter(v: string) {
    const q = v.trim().toLowerCase();
    box.current?.querySelectorAll<HTMLElement>("li.credit").forEach((li) => { li.hidden = !!q && !(li.dataset.q ?? "").includes(q); });
  }
  return (
    <div ref={box}>
      <input type="search" aria-label="Find an actor or character" placeholder="Find an actor or character" onChange={(e) => filter(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      {children}
    </div>
  );
}
