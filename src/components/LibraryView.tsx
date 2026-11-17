"use client";
import { useEffect, useMemo, useState } from "react";
import LibraryList from "./LibraryList";
import { useRef } from "react";
import { useRetained } from "@/lib/useRetained";
import { STATUS_LABEL, type LibItem, type Status } from "@/lib/types";
import { SORTS, orderItems, type SortKey } from "@/lib/library-sort";
import { KindSeg } from "./KindSeg";
import { mixed, ofKind, type Kind } from "@/lib/kind";
import { KindContext } from "@/lib/kind-context";
import { LIBRARY_TAB_ORDER, tabGroup } from "@/lib/status-order";

const TABS: [Status | "all", string][] = LIBRARY_TAB_ORDER.map((k) => [k, k === "all" ? "All" : STATUS_LABEL[k]]);

/** The filter chips and the list. Switching chips is instant (no server trip); the URL is kept in step so a refresh or shared link lands on the same filter. */
export default function LibraryView({ items, initial, initialSort = "watched", initialKind = "all", initialFlip = false, initialUnrated = false, top, between }: { items: LibItem[]; initial: Status | "all"; initialSort?: SortKey; initialKind?: Kind; initialFlip?: boolean; initialUnrated?: boolean; top?: React.ReactNode; between?: React.ReactNode }) {
  const [filter, setFilter] = useState<Status | "all">(initial);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [flip, setFlip] = useState(initialFlip);
  const [unrated, setUnrated] = useState(initialUnrated);
  const pool = ofKind(items, kind);
  const count = (s: Status | "all") => (s === "all" ? pool.length : pool.filter((l) => l.status === s).length);
  // Rows hold their place while you work: an unmarked title stays (unmarked) so you can mark it again, and a changed one
  // stays in the list it was in. Where a row belongs is fixed when it first appears, and refreshed when you pick a chip.
  const [all, reset] = useRetained(items, "start");
  const where = useRef(new Map<string, { status: Status; must: boolean }>());
  for (const l of all) if (!where.current.has(l.key)) where.current.set(l.key, { status: l.status, must: l.priority === "must" });
  const picked = useMemo(() => {
    const ofType = ofKind(all, kind);
    return filter === "all" ? ofType : ofType.filter((l) => where.current.get(l.key)!.status === filter);
  }, [all, kind, filter]);
  // The arrow turns at once; the (possibly long) list re-orders only after the turn has finished, so a heavy render can't stall the animation.
  const [listFlip, setListFlip] = useState(initialFlip);
  useEffect(() => { const t = setTimeout(() => setListFlip(flip), 380); return () => clearTimeout(t); }, [flip]);
  // Memoised so the button's own (urgent) render never re-sorts or re-renders the list: that stall froze the flip animation.
  const shown = useMemo(() => {
    const sorted = orderItems(picked, sort, listFlip, unrated); // stable, so ties keep newest-first
    return filter === "watchlist" && (sort === "added" || sort === "watched") && !listFlip ? [...sorted].sort((a, b) => Number(!where.current.get(a.key)!.must) - Number(!where.current.get(b.key)!.must)) : sorted; // default order puts must-watch first
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, filter, sort, listFlip, unrated]);
  const setParam = (key: string, on: boolean) => {
    const u = new URL(window.location.href);
    if (on) u.searchParams.set(key, "1"); else u.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", u);
  };
  function choose(k: Status | "all") {
    reset(); where.current.clear();
    setFilter(k);
    const u = new URL(window.location.href);
    if (k === "all") u.searchParams.delete("f"); else u.searchParams.set("f", k);
    window.history.replaceState(window.history.state, "", u);
  }
  function chooseKind(k: Kind) {
    setKind(k);
    const u = new URL(window.location.href);
    if (k === "all") u.searchParams.delete("k"); else u.searchParams.set("k", k);
    window.history.replaceState(window.history.state, "", u);
  }
  function chooseSort(k: SortKey) {
    setSort(k);
    const u = new URL(window.location.href);
    if (k === "watched") u.searchParams.delete("s"); else u.searchParams.set("s", k);
    window.history.replaceState(window.history.state, "", u);
  }
  const stickRef = useRef<HTMLDivElement>(null);
  // Phones: the pinned chips + sort bar collapse like a browser's address bar, tied to the finger. `off` (px, 0..R, R = their height) moves 1:1 with the scroll
  // distance (scroll down: slide up under the header, any upward scroll: slide back down), and the filter box (pinned right under them) moves with them, so
  // when they are gone it sits directly under the header. Both read `--lib-off` in their sticky `top` (globals.css). Written straight to the DOM, no state
  // per scroll event; when scrolling stops, a half-way stack settles to the nearer end. Wider screens keep everything pinned (off stays 0).
  useEffect(() => {
    const el = stickRef.current;
    if (!el) return;
    const root = document.documentElement;
    const phone = () => window.matchMedia("(max-width: 559px)").matches;
    let R = 0, off = 0, last = window.scrollY, raf = 0, idle: ReturnType<typeof setTimeout> | undefined;
    const apply = (v: number) => { off = Math.min(R, Math.max(0, v)); root.style.setProperty("--lib-off", `${off}px`); };
    const measure = () => { R = el.getBoundingClientRect().height; root.style.setProperty("--lib-stick-h", `${R}px`); apply(phone() ? off : 0); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const onScroll = () => {
      const y = window.scrollY, d = y - last;
      last = y;
      if (!phone()) return;
      cancelAnimationFrame(raf);
      apply(y <= 0 ? 0 : off + d);
      clearTimeout(idle);
      idle = setTimeout(() => {
        const from = off, to = from > R / 2 && window.scrollY >= R ? R : 0;
        if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(to); return; }
        const t0 = performance.now();
        const step = (now: number) => { const k = Math.min(1, (now - t0) / 160); apply(from + (to - from) * (1 - (1 - k) * (1 - k))); if (k < 1) raf = requestAnimationFrame(step); };
        raf = requestAnimationFrame(step);
      }, 140);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect(); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); clearTimeout(idle);
      for (const v of ["--lib-off", "--lib-stick-h"]) root.style.removeProperty(v);
    };
  }, []);
  return (
    <>
      <KindContext.Provider value={kind}>{top}</KindContext.Provider>
      <div className="lib-stick" ref={stickRef}>
      <div className="chips scroll lib-chips" role="group" aria-label="Filter">
        {TABS.map(([k, label], i) => { const { group, pairStart } = tabGroup(k, i); return <button key={k} type="button" className={`chip${group ? ` lib-${group}` : ""}${pairStart ? " lib-pair-start" : ""}`} aria-pressed={filter === k} onClick={() => choose(k)}>{label} <span className="mono">{count(k)}</span></button>; })}
      </div>
      <div className="bz-bar" style={{ marginTop: 12 }}>
        {(kind !== "all" || mixed(items)) && <KindSeg value={kind} onChange={chooseKind} />}
        <span className="sortgrp">
          <button type="button" className="sort-flip" aria-pressed={flip} aria-label="Flip sort order" title={flip ? "Reversed: click to restore" : "Click to reverse the order"} onClick={() => { setFlip(!flip); setParam("r", !flip); }}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14m0 0-5-5m5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <label className="pillsel" title="Sort by">
            <select aria-label="Sort library" value={sort} onChange={(e) => chooseSort(e.target.value as SortKey)}>
              {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
        </span>
        <button type="button" className="chip sm" aria-pressed={unrated} title="Only titles you haven't rated" onClick={() => { setUnrated(!unrated); setParam("u", !unrated); }}>Unrated</button>
      </div>
      </div>
      {between}
      <LibraryList items={shown} />
    </>
  );
}
