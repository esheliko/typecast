"use client";
import { useEffect, useRef, useState } from "react";
import { img } from "@/lib/img";
import { posKey, whoApi } from "@/lib/who-client";
import type { Pos, Span } from "@/lib/who-types";

/** Small pieces the /who panes share: photos, skeleton bars, section headings and the lazily loaded dates. */

export function Photo({ path, name, w = "w185", className = "wx-ph", eager }: { path: string | null; name: string; w?: string; className?: string; eager?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return path ? <img className={className} src={img(path, w)} alt="" loading={eager ? "eager" : "lazy"} decoding="async" /> : <span className={`${className} wx-noph`} aria-hidden="true">{name.charAt(0)}</span>;
}

export const Sk = ({ w, h = 14, style }: { w: number | string; h?: number; style?: React.CSSProperties }) => <span className="sk-b wx-sk" style={{ width: w, height: h, ...style }} aria-hidden="true" />;

export function Section({ id, title, count, note, children }: { id?: string; title: string; count?: number | string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="wx-sec" aria-label={title} id={id}>
      <h3 className="wx-h">{title}{count != null && <span className="muted"> · {count}</span>}</h3>
      {note && <p className="small muted wx-secnote">{note}</p>}
      {children}
    </section>
  );
}

/** A failed section: one line, never an empty pane. */
export const Soft = ({ children }: { children: React.ReactNode }) => <p className="small muted wx-soft" role="status">{children}</p>;

/** About `n` rows with a "Show all" for the rest. */
export function useLimit(total: number, n = 5): { shown: number; all: boolean; toggle: () => void } {
  const [all, setAll] = useState(false);
  return { shown: all ? total : Math.min(total, n), all, toggle: () => setAll((v) => !v) };
}
export function More({ total, shown, all, toggle, noun = "" }: { total: number; shown: number; all: boolean; toggle: () => void; noun?: string }) {
  if (total <= shown && !all) return null;
  return <button type="button" className="chip wx-more" onClick={toggle} aria-expanded={all}>{all ? "Show fewer" : `Show all ${total}${noun ? ` ${noun}` : ""}`}</button>;
}

/**
 * A person's own dates for the series in `keys`, loaded lazily in the order given (put what is on screen first) a few at a time.
 * `undefined` means not loaded yet (draw a skeleton); `null` means TMDB has nothing usable. `cur` is the show being watched:
 * its dates come back clipped to the position, so nothing later is given away.
 */
export function useSpans(pid: number, keys: string[], cur: { k: string; pos: Pos; cids: string[] } | null): { spans: Record<string, Span | null>; failed: boolean } {
  const tok = `${pid}|${cur ? `${cur.k}|${posKey(cur.pos)}` : ""}`;
  const store = useRef<{ tok: string; data: Record<string, Span | null>; asked: Set<string> }>({ tok, data: {}, asked: new Set() });
  const [, bump] = useState(0);
  const [failed, setFailed] = useState(false);
  if (store.current.tok !== tok) {
    // Same person, another position: only the show being watched changes, so every other row keeps its dates (no flash of skeletons).
    const same = store.current.tok.split("|")[0] === String(pid);
    const old = store.current;
    store.current = { tok, data: same ? Object.fromEntries(Object.entries(old.data).filter(([k]) => k !== cur?.k)) : {}, asked: same ? new Set([...old.asked].filter((k) => k !== cur?.k)) : new Set() };
  }
  const joined = keys.filter((k) => k.startsWith("tv:")).join(",");
  const curRef = useRef(cur); curRef.current = cur;
  useEffect(() => {
    const st = store.current;
    const need = joined.split(",").filter((k) => k && !st.asked.has(k));
    if (!need.length) return;
    need.forEach((k) => st.asked.add(k));
    const chunks: string[][] = [];
    for (let i = 0; i < need.length; i += 7) chunks.push(need.slice(i, i + 7));
    let alive = true;
    let next = 0;
    const run = async () => {
      for (let c = next++; c < chunks.length; c = next++) {
        try {
          const r = await whoApi.spans(pid, chunks[c], curRef.current);
          if (alive && store.current === st) { st.data = { ...st.data, ...r }; bump((n) => n + 1); }
        } catch { if (alive) { st.data = { ...st.data, ...Object.fromEntries(chunks[c].map((k) => [k, null])) }; setFailed(true); bump((n) => n + 1); } }
      }
    };
    void Promise.all([run(), run()]);
    return () => { alive = false; need.forEach((k) => { if (!(k in st.data)) st.asked.delete(k); }); };
  }, [pid, joined, tok]);
  return { spans: store.current.data, failed };
}

/** Month and year of a film's release or a series' span start. */
export const SEEN_STATUS = new Set(["watched", "watching", "partial"]);
