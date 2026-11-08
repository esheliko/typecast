"use client";
import { useState, type ReactNode } from "react";
import { KINDS, mixed, ofKind, type Kind } from "@/lib/kind";

/** Both / Films / Series switch, the same one Browse uses. */
export function KindSeg({ value, onChange, label = "Show" }: { value: Kind; onChange: (k: Kind) => void; label?: string }) {
  return (
    <div className="seg kind-seg" role="group" aria-label={label}>
      {KINDS.map(([k, text]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{text}</button>)}
    </div>
  );
}

/**
 * Wraps any title list with a Films / Series choice. The switch shows whenever the list holds both (or a choice is set),
 * and `children` gets the titles of the chosen kind.
 */
export function KindFilter<T extends { type: string }>({ items, children, style }: { items: T[]; children: (shown: T[]) => ReactNode; style?: React.CSSProperties }) {
  const [kind, setKind] = useState<Kind>("all");
  const shown = ofKind(items, kind);
  const show = kind !== "all" || mixed(items);
  return (
    <>
      {show && <div className="kind-bar" style={style}><KindSeg value={kind} onChange={setKind} /></div>}
      {shown.length || !items.length ? children(shown) : <p className="small muted">No {kind === "tv" ? "series" : "films"} here.</p>}
    </>
  );
}
