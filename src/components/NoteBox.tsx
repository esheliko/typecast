"use client";
import { useEffect, useRef, useState } from "react";
import { setNote } from "@/app/actions";
import type { MediaType } from "@/lib/types";

export default function NoteBox({ type, id, initial, enabled }: { type: MediaType; id: number; initial: string; enabled: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function change(v: string) {
    setText(v); setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await setNote(type, id, v); setSaved(true); }, 700);
  }
  return (
    <div>
      <textarea id="note" aria-label="Notes" disabled={!enabled} value={text} onChange={(e) => change(e.target.value)} placeholder="Your thoughts, who recommended it, where you stopped" />
      <p className="small muted" style={{ margin: "4px 0 0" }}>{enabled ? (saved ? "Saved" : "Saving…") : "Mark this title Watching, Partly watched, To watch or Watched to keep notes."}</p>
    </div>
  );
}
