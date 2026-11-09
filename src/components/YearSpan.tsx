"use client";
import { useState, type ReactNode } from "react";

/**
 * The series facts line ("12 seasons · 279 episodes · 2007–2019 · Ended"). The year range is a quiet button: hover shows the exact dates,
 * a tap opens them (plus the finale, passed as children) on a line right under it, so nothing ever overflows a narrow screen.
 */
export default function YearSpan({ lead, span, tail, dates, children }: { lead: string; span: string; tail: string; dates: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const before = lead;
  return (
    <>
      <div className="sh-meta">
        {before}{before && span ? " · " : ""}
        {span && <button type="button" className="ep-jump" title={dates} aria-expanded={open} onClick={() => setOpen(!open)}>{span}</button>}
        {tail && (before || span) ? " · " : ""}{tail}
      </div>
      {open && <div className="sh-meta sh-dates">{dates}</div>}
      {open && children && <div className="sh-meta">{children}</div>}
    </>
  );
}
