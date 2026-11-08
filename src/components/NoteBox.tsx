"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { setNote } from "@/app/actions";
import { useLib } from "@/components/cast/LibState";
import type { MediaType } from "@/lib/types";

export default function NoteBox({ type, id, initial, enabled }: { type: MediaType; id: number; initial: string; enabled: boolean }) {
  const { markRich } = useLib();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(true);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(initial);
  const dirty = useRef(false);
  /** Saves run one after another so an older note can never overwrite a newer one. */
  const chain = useRef<Promise<void>>(Promise.resolve());

  /** Send the pending note now (no-op when nothing changed). A failure keeps the text and the dirty flag so it can be retried. */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    const v = latest.current;
    dirty.current = false;
    chain.current = chain.current.then(async () => {
      try {
        await setNote(type, id, v);
        if (v.trim()) markRich(`${type}:${id}`);
        if (!dirty.current) { setSaved(true); setFailed(false); }
      } catch {
        dirty.current = true;
        setFailed(true);
      }
    });
  }, [type, id, markRich]);

  // Closing the popup or leaving the page must not drop a note still waiting for its debounce.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
      flush();
    };
  }, [flush]);

  function change(v: string) {
    setText(v); setSaved(false); setFailed(false);
    latest.current = v; dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }
  return (
    <div>
      <textarea id="note" aria-label="Notes" disabled={!enabled} value={text} onChange={(e) => change(e.target.value)} placeholder="Your thoughts, who recommended it, where you stopped" />
      <p className="small muted" style={{ margin: "4px 0 0" }}>
        {!enabled ? "Mark this title Watching, Partly watched, To watch or Watched to keep notes."
          : failed ? <span className="err" role="alert">Could not save your note. <button type="button" onClick={flush} style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0 }}>Retry</button></span>
          : saved ? "Saved" : "Saving…"}
      </p>
    </div>
  );
}
