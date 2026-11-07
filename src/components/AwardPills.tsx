"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface PillSection { name: string; entries: { category: string; year: string }[]; won: boolean }
export interface Pill { text: string; win: boolean; sections: PillSection[] }

/** The header pills. Tapping one opens a small popover under the row listing exactly what it counts; tap again, tap outside or Esc closes it. */
export function AwardPills({ pills, icon }: { pills: Pill[]; icon: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(null); };
    // Capture phase on window so Esc closes only this popover, not the title popup underneath it.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(null); } };
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key, true); };
  }, [open]);
  const cur = open === null ? null : pills[open];
  return (
    <div className="aw-chips" ref={box} aria-label="Awards">
      {pills.map((p, i) => (
        <button key={p.text} type="button" className={`aw-chip${p.win ? " win" : ""}`} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
          {p.win && icon}{p.text}
        </button>
      ))}
      {cur && (
        <div className="aw-pop" role="dialog" aria-label="Awards">
          {cur.sections.map((s) => (
            <div key={s.name}>
              <div className="aw-pn">{s.name}</div>
              <ul className="aw-list">
                {s.entries.map((e, i) => (
                  <li key={i} className={s.won ? "win" : ""}>
                    <span className="aw-c">{e.category || "Top prize"}</span>
                    {e.year && <span className="aw-y">{e.year}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
