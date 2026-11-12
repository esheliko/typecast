"use client";
import { useEffect, useRef, useState } from "react";
import { img } from "@/lib/img";
import { posKey, whoApi } from "@/lib/who-client";
import { useWho } from "./WhoContext";
import type { Pos, Span } from "@/lib/who-types";

/** Small pieces the /who panes share: photos, skeleton bars, section headings and the lazily loaded dates. */

export function Photo({ path, name, w = "w185", className = "wx-ph", eager }: { path: string | null; name: string; w?: string; className?: string; eager?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return path ? <img className={className} src={img(path, w)} alt="" loading={eager ? "eager" : "lazy"} decoding="async" /> : <span className={`${className} wx-noph`} aria-hidden="true">{name.charAt(0)}</span>;
}

/** A photo that opens full size when pressed (the page-wide viewer). Do not put it inside another button or link. */
export function ZoomBtn({ path, name, size = "w780", className = "", children }: { path: string | null | undefined; name: string; size?: string; className?: string; children: React.ReactNode }) {
  const { zoom } = useWho();
  return <button type="button" className={`wx-zoom ${className}`} onClick={() => path && zoom({ path, name, size })} aria-label={`Enlarge photo of ${name}`} disabled={!path}>{children}</button>;
}

export function Lightbox({ path, name, size = "w780", gallery, onClose }: { path: string; name: string; size?: string; gallery?: string[]; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const set = gallery && gallery.length > 1 && gallery.includes(path) ? gallery : null;
  const [i, setI] = useState(set ? set.indexOf(path) : 0);
  const n = set?.length ?? 1;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const cur = set ? set[i] : path;
  const touch = useRef<number | null>(null);
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => { active.current?.scrollIntoView({ inline: "center", block: "nearest" }); }, [i]);
  useEffect(() => {
    btn.current?.focus();
    const k = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onClose(); }
      else if (set && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) { ev.preventDefault(); ev.stopPropagation(); setI((x) => (x + (ev.key === "ArrowRight" ? 1 : -1) + set.length) % set.length); }
      else if (set && (ev.key === "Home" || ev.key === "End")) { ev.preventDefault(); ev.stopPropagation(); setI(ev.key === "Home" ? 0 : set.length - 1); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose, set]);
  return (
    <div className={`wx-lightbox${set ? " wx-lbset" : ""}`} role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}
      onTouchStart={(ev) => { touch.current = ev.touches[0].clientX; }}
      onTouchEnd={(ev) => { const x0 = touch.current; touch.current = null; if (!set || x0 == null) return; const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <button ref={btn} type="button" className="back wx-lbx" onClick={onClose}><span aria-hidden="true">&#215;</span> Close</button>
      {set && <button type="button" className="wx-lbnav prev" onClick={() => go(-1)} aria-label="Previous photo"><span aria-hidden="true">&lsaquo;</span></button>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={cur} src={img(cur, size)} alt={name} referrerPolicy="no-referrer" />
      {set && <button type="button" className="wx-lbnav next" onClick={() => go(1)} aria-label="Next photo"><span aria-hidden="true">&rsaquo;</span></button>}
      {set && <span className="wx-lbcount" aria-live="polite">{i + 1} / {n}</span>}
      {set && (
        <div className="wx-lbstrip" role="group" aria-label="All photos">
          {set.map((p, k) => (
            <button key={p} ref={k === i ? active : undefined} type="button" className={`wx-lbchip${k === i ? " on" : ""}`} onClick={() => setI(k)} aria-label={`Show photo ${k + 1} of ${n}`} aria-current={k === i ? "true" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(p, "w92")} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
      {set && [-1, 1].map((d) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={d} className="wx-lbpre" src={img(set[(i + d + n) % n], size)} alt="" aria-hidden="true" />)}
    </div>
  );
}

export const Sk = ({ w, h = 14, style }: { w: number | string; h?: number; style?: React.CSSProperties }) => <span className="sk-b wx-sk" style={{ width: w, height: h, ...style }} aria-hidden="true" />;

export function Section({ id, title, count, note, bare, inline, children }: { id?: string; title: string; bare?: boolean; inline?: boolean; count?: number | string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="wx-sec" aria-label={title} id={id}>
      {inline && note && !bare ? (
        <div className="wx-hline">
          <h3 className="wx-h">{title}{count != null && <span className="muted"> · {count}</span>}</h3>
          <p className="small muted wx-secnote">{note}</p>
        </div>
      ) : (
        <>
          <h3 className={bare ? "sr-only" : "wx-h"}>{title}{count != null && <span className="muted"> · {count}</span>}</h3>
          {note && <p className="small muted wx-secnote">{note}</p>}
        </>
      )}
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
export function More({ total, shown, all, toggle, noun = "", inline = false }: { total: number; shown: number; all: boolean; toggle: () => void; noun?: string; inline?: boolean }) {
  if (total <= shown && !all) return null;
  const label = all ? "Show fewer" : `Show all ${total}${noun ? ` ${noun}` : ""}`;
  /** `inline`: a chip-styled item inside a chip row (put it inside the `ul`). The count lives in the section note, so the label is bare. */
  if (inline) return <li><button type="button" className="wx-epchip wx-epmore" onClick={toggle} aria-expanded={all}>{all ? "Show fewer" : "Show all"}</button></li>;
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
