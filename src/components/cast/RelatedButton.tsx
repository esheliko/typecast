"use client";
import { useEffect, useRef, useState } from "react";
import { useLib } from "./LibState";
import type { Group } from "./Franchise";
import type { Item } from "@/lib/types";

/**
 * Opens the rest of a title's collection or universe, with the number still unmarked beside the icon.
 * Available on every title, seen or not. Looks up the franchise once the button scrolls into view;
 * stays tappable (dimmed) when nothing is left to mark. Hidden while the lookup is still running.
 */
export default function RelatedButton({ it }: { it: Item }) {
  const { get, openRelated, groupsOf } = useLib();
  const box = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  useEffect(() => {
    const el = box.current; if (near || !el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el); return () => io.disconnect();
  }, [near]);
  useEffect(() => { if (!near) return; let on = true; groupsOf(it).then((g) => on && setGroups(g)); return () => { on = false; }; }, [near, it, groupsOf]);
  if (!groups) return <span ref={box} className="rel-b ghost" aria-hidden="true" />;
  const left = new Set(groups.flatMap((g) => g.items).filter((i) => !get(i.key)).map((i) => i.key)).size;
  const label = left ? `${left} related ${left === 1 ? "title" : "titles"} to mark for ${it.title}` : `Related titles for ${it.title}`;
  return (
    <button type="button" className={`rel-b${left ? " has" : ""}`} onClick={() => openRelated(it)} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8 11l8-4M8 13l8 4" /></svg>
      {left > 0 && <span className="rel-n">{left > 99 ? "99+" : left}</span>}
    </button>
  );
}
