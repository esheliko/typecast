"use client";
import { useEffect, useRef } from "react";
import { crumbLabel, type Trail } from "@/lib/trail";

/** The popup's breadcrumb: title › person › title chips on one line that scrolls sideways, kept scrolled so the current one shows. */
export function PopupTrail({ trail, onJump }: { trail: Trail; onJump: (to: number) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const n = trail.steps.length;
  // Show the current (last-opened or jumped-to) crumb at the end of the view whenever a step is added or the position moves.
  useEffect(() => {
    const el = row.current; if (!el) return;
    const cur = el.querySelector<HTMLElement>('[aria-current="step"]');
    if (!cur) return;
    const end = cur.offsetLeft + cur.offsetWidth + 12;
    el.scrollTo({ left: Math.max(0, end - el.clientWidth) });
  }, [n, trail.i]);
  return (
    <nav className="ptrail" aria-label="Path through this popup">
      <div className="ptrail-row" ref={row}>
        {trail.steps.map((s, k) => (
          <span className="ptrail-item" key={k}>
            {k > 0 && <span className="ptrail-sep" aria-hidden="true">&#8250;</span>}
            {k === trail.i
              ? <span className="ptrail-chip cur" aria-current="step" title={s.label}>{crumbLabel(s.label)}</span>
              : <button type="button" className="ptrail-chip" title={s.label} onClick={() => onJump(k)}>{crumbLabel(s.label)}</button>}
          </span>
        ))}
      </div>
    </nav>
  );
}
