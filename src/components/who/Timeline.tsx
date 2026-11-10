"use client";
import { useMemo, useState } from "react";
import { dotSize, layoutTimeline, type TItem } from "@/lib/who-timeline";
import type { Range } from "@/lib/who-types";

export interface AxisItem extends TItem { label: string; run?: boolean; seen?: boolean; /** The show being watched: gold, and only as far as you know it. */ now?: boolean }

const BAR = 10;   // a bar's height (px)
const PAD = 3;    // space above and below a mark inside its lane

/**
 * The career axis: a horizontal year scale, each credit drawn where THEY appeared (a dot for a year or less, a bar for a longer run),
 * seen titles in the Seen green. Dots that sit close together are merged into one dot whose size follows how many it stands for;
 * pressing it steps through them. The show being watched is gold and drawn only up to what you know so far (its right end fades:
 * that is where you are, not where it ends), and the same gold sits in a row of its own above the credits.
 * Hover or focus on a mark shows a tooltip and previews that row's comparison; a click selects it and scrolls to its row.
 */
export function Timeline({ items, refRange, refLabel, refSoFar, selected, hot, onPick, onPreview }: {
  items: AxisItem[]; refRange: Range | null; refLabel: string; /** The reference range stops where you are (a whole season, not yet an episode). */ refSoFar: boolean;
  selected: string | null; hot: string | null; onPick: (id: string) => void; onPreview: (id: string | null) => void;
}) {
  const lay = useMemo(() => layoutTimeline(items, refRange), [items, refRange]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [tip, setTip] = useState<string | null>(null);
  const sized = useMemo(() => lay.marks.map((m) => ({ ...m, px: m.dot ? dotSize(m.n) : BAR })), [lay.marks]);
  // Lane heights follow the biggest mark in them, so a big merged dot never touches the lane below.
  const laneTop = useMemo(() => {
    const h: number[] = Array.from({ length: lay.lanes }, () => 14);
    sized.forEach((m) => { h[m.lane] = Math.max(h[m.lane], m.px + PAD * 2); });
    const top: number[] = []; let y = 0;
    h.forEach((x, i) => { top[i] = y; y += x; });
    return { h, top, total: y };
  }, [sized, lay.lanes]);
  if (!items.length && !refRange) return null;
  const tm = tip ? sized.find((m) => m.id === tip) : null;
  const tx = tm ? Math.min(0.82, Math.max(0.18, (tm.x0 + tm.x1) / 2)) : 0;
  const flip = !!lay.ref && lay.ref.x0 > 0.72;
  const enter = (id: string) => { setTip(id); onPreview(id); };
  const leave = () => { setTip(null); onPreview(null); };
  const text = (ids: string[]) => ids.map((i) => byId.get(i)?.label ?? "");
  return (
    <figure className="wx-axis" aria-label="Career timeline">
      <div className="wx-axis-plot">
        {lay.ref && (
          <div className="wx-refrow" aria-hidden="true">
            <span className={`wx-refbar${refSoFar ? " sofar" : ""}`} style={{ left: `${lay.ref.x0 * 100}%`, width: `max(10px, ${(lay.ref.x1 - lay.ref.x0) * 100}%)` }} />
            <span className={`wx-reflab${flip ? " flip" : ""}`} style={flip ? { right: `${(1 - lay.ref.x0) * 100}%` } : { left: `${lay.ref.x1 * 100}%` }}>{refLabel}</span>
          </div>
        )}
        <div className="wx-axis-lanes" style={{ height: Math.max(laneTop.total, 14) }}>
          {lay.ticks.map((t) => <span key={t.label} className="wx-gridline" style={{ left: `${t.x * 100}%` }} aria-hidden="true" />)}
          {lay.ref && <span className="wx-refmark" style={{ left: `${lay.ref.x0 * 100}%`, width: `max(2px, ${(lay.ref.x1 - lay.ref.x0) * 100}%)` }} aria-hidden="true" />}
          {sized.map((m) => {
            const lines = text(m.ids);
            const many = m.n > 1;
            const it = byId.get(m.id)!;
            const isSel = !!selected && m.ids.includes(selected);
            const isHot = !!hot && m.ids.includes(hot);
            const seen = m.ids.some((i) => byId.get(i)?.seen);
            const label = many ? `${m.n} credits: ${lines.join("; ")}` : it.label;
            const top = laneTop.top[m.lane] + (laneTop.h[m.lane] - m.px) / 2;
            const click = () => {
              if (!many) return onPick(m.id);
              const at = selected ? m.ids.indexOf(selected) : -1;
              onPick(m.ids[(at + 1) % m.ids.length]);
            };
            return (
              <button key={m.id} type="button" className={`wx-mark${m.dot ? " dot" : ""}${many ? " merged" : ""}${it.run ? " run" : ""}${seen ? " seen" : ""}${it.now ? " now" : ""}${isSel ? " sel" : ""}${isHot ? " hot" : ""}`}
                style={m.dot ? { left: `${((m.x0 + m.x1) / 2) * 100}%`, width: m.px, height: m.px, marginLeft: -m.px / 2, top } : { left: `${m.x0 * 100}%`, width: `${(m.x1 - m.x0) * 100}%`, height: m.px, top }}
                aria-label={label} aria-pressed={isSel}
                onClick={click} onMouseEnter={() => enter(m.id)} onMouseLeave={leave} onFocus={() => enter(m.id)} onBlur={leave}>
                {many && m.px >= 20 && <span className="wx-mn" aria-hidden="true">{m.n}</span>}
              </button>
            );
          })}
          {tm && (
            <div className="wx-tip" role="tooltip" style={{ left: `${tx * 100}%`, top: laneTop.top[tm.lane] + PAD }}>
              {text(tm.ids).slice(0, 5).map((l, i) => <span key={i} className="wx-tipl">{l}</span>)}
              {tm.n > 5 && <span className="wx-tipl">+{tm.n - 5} more</span>}
              {tm.n > 1 && <span className="wx-tipl wx-tipn">Press to step through them</span>}
              {byId.get(tm.id)?.now && <span className="wx-tipl wx-tipn">So far: where you are, not where it ends</span>}
            </div>
          )}
        </div>
        <div className="wx-ticks" aria-hidden="true">
          {lay.ticks.map((t) => <span key={t.label} style={{ left: `${t.x * 100}%` }}>{t.label}</span>)}
        </div>
      </div>
    </figure>
  );
}
