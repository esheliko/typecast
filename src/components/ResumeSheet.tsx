"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWatchControl } from "./Watching";
import { useLib } from "./cast/LibState";
import { clockLabel, durLabel, minutesLeft, nudge, stoppedPct } from "@/lib/film-resume";
import type { Item } from "@/lib/types";

/**
 * "Resume" for a film that was stopped part-way (docs/features/film-resume.md): a button that opens a small bottom sheet with the stopped time,
 * -5 / Play / +5, "Resume watching" and "Mark watched". Opening the sheet and moving the time write NOTHING; only the two explicit buttons do.
 * `className` styles the button; `children` is its text.
 */
export function ResumeButton({ it, stopped, runtime, className, children = "Resume" }: { it: Item; stopped: number; runtime: number | null; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Resume ${it.title}`}>{children}</button>
      {open && createPortal(<ResumeSheet it={it} stopped={stopped} runtime={runtime} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ResumeSheet({ it, stopped, runtime, onClose }: { it: Item; stopped: number; runtime: number | null; onClose: () => void }) {
  const wc = useWatchControl();
  const lib = useLib();
  const [min, setMin] = useState(stopped);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("keydown", esc, true); prev?.focus?.(); };
  }, [onClose]);
  const left = minutesLeft(min, runtime);
  const resume = () => {
    if (!wc) return;
    // The existing start flow (a title that is not Watching becomes Watching, the bar appears, /watching opens), then the clock is set to the chosen time.
    wc.start(it, runtime);
    wc.patchWatch(it.key, (w) => { const { paused: _p, ...rest } = w; return { ...rest, started: Date.now() - min * 60000 }; }); // eslint-disable-line @typescript-eslint/no-unused-vars
    onClose();
  };
  const watched = () => {
    if (wc?.watch?.key === it.key) wc.stop({ restore: false });
    void lib.mark(it, "watched", undefined, true);
    onClose();
  };
  return (
    <div className="gl-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="rs-sheet" role="dialog" aria-modal="true" aria-label={`Where did you stop ${it.title}`} tabIndex={-1}>
        <div className="gl-bar rs-bar">
          <b className="gl-h">{it.title}</b>
          <button type="button" className="back" onClick={onClose} aria-label="Close"><span aria-hidden="true">&#215;</span> Close</button>
        </div>
        <span className="rs-lab">How far in</span>
        <div className="rs-clock">
          <span className="ask-step paused">
            <button type="button" onClick={resume} aria-label="Play from here" title="Resume watching from here">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
            </button>
            <button type="button" onClick={() => setMin((m) => nudge(m, -5, runtime))} aria-label="5 minutes less">&minus;5</button>
            <b aria-live="polite">{clockLabel(min)}</b>
            <button type="button" onClick={() => setMin((m) => nudge(m, 5, runtime))} aria-label="5 minutes more">+5</button>
          </span>
        </div>
        {runtime ? <div className="rs-bar-track" role="img" aria-label={`${stoppedPct(min, runtime)} percent`}><i style={{ width: `${stoppedPct(min, runtime)}%` }} /></div> : null}
        <p className="small muted rs-of">{runtime ? `of ${durLabel(runtime)}${left !== null ? ` · ${left} min left` : ""}` : "Runtime not known"}</p>
        <div className="rs-act">
          <button type="button" className="btn gold" onClick={resume}>Resume watching</button>
          <button type="button" className="btn" onClick={watched}>Mark watched</button>
        </div>
      </div>
    </div>
  );
}
