"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { hiddenNote, labelOf, type HiddenLine } from "@/lib/spoiler-line";

/**
 * The placeholder that stands where a spoiler line held something back (docs/features/spoilers.md):
 * "Spoilers hidden for <Title> · Show · Set my place". Show reveals only that view (the caller refetches with `reveal=1` or flips its own
 * state) and writes nothing to the library; Set my place goes where the saved place is set. A title with no saved place also gets a small
 * suggestion that can be dismissed (remembered on this device, per title).
 */
const HINT = "typecast.placeHint.";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

export function SpoilerGate({ title, hidden, onShow, placeHref, hintKey, compact, what, label }: {
  title: string; hidden: HiddenLine; onShow: () => void;
  /** Where "Set my place" goes (e.g. /watching?k=tv-79744). Left out, the link is not drawn. */
  placeHref?: string;
  /** Title key ("tv:79744"): with it, a series with no saved place shows the dismissible suggestion. */
  hintKey?: string;
  /** One quiet line (rows and tiles) instead of a block. */
  compact?: boolean;
  /** What is held back, in words ("episode names and plots"). */
  what?: string;
  /** Own wording instead of "Spoilers hidden for <Title>" (the cast note says "Later episodes hidden"). */
  label?: string;
}) {
  const [gone, setGone] = useState(true);
  useEffect(() => { setGone(safe(() => localStorage.getItem(HINT + hintKey) === "1", false)); }, [hintKey]);
  const note = hiddenNote(hidden);
  const text = label ?? labelOf(hidden.kind === "upto" ? { kind: "upto", s: hidden.s, e: hidden.e } : { kind: "series-only" }, title);
  const suggest = hidden.kind === "series-only" && !!hintKey && !compact && !gone;
  return (
    <div className={`sgate${compact ? " sgate-c" : ""}`} role="group" aria-label={text}>
      <span className="sgate-t">{text}{!compact && what ? <span className="muted"> ({what}{note ? `, ${note} shown` : ""})</span> : null}</span>
      <span className="sgate-a">
        <button type="button" className="linkish" onClick={onShow}>Show</button>
        {placeHref && <><span aria-hidden="true"> · </span><Link className="linkish" href={placeHref}>Set my place</Link></>}
      </span>
      {suggest && (
        <span className="sgate-h small muted">No place saved for {title}, so only the basics are shown.{" "}
          <button type="button" className="linkish" onClick={() => { setGone(true); safe(() => localStorage.setItem(HINT + hintKey, "1"), undefined); }}>Dismiss</button></span>
      )}
    </div>
  );
}
