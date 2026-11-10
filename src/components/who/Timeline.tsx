"use client";
import { useMemo, useState } from "react";
import { layoutTimeline, type TItem } from "@/lib/who-timeline";
import type { Range } from "@/lib/who-types";

export interface AxisItem extends TItem { label: string; run?: boolean; seen?: boolean }

/**
 * The career axis: a horizontal year scale, each credit drawn where THEY appeared (a dot for a year or less, a bar for a longer run),
 * seen titles in the Seen green, the chosen one larger, and a gold marker for what is being watched (or the row measured from).
 * Hover or focus on a mark shows a tooltip and previews that row's comparison; a click selects it and scrolls to its row.
 */
export function Timeline({ items, refRange, refLabel, selected, hot, onPick, onPreview }: {
  items: AxisItem[]; refRange: Range | null; refLabel: string; selected: string | null; hot: string | null; onPick: (id: string) => void; onPreview: (id: string | null) => void;
}) {
  const lay = useMemo(() => layoutTimeline(items, refRange), [items, refRange]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [tip, setTip] = useState<string | null>(null);
  const LANE = 22;
  const h = Math.max(1, lay.lanes) * LANE + 8;
  if (!items.length && !refRange) return null;
  const tm = tip ? lay.marks.find((m) => m.id === tip) : null;
  const tx = tm ? Math.min(0.82, Math.max(0.18, (tm.x0 + tm.x1) / 2)) : 0;
  const flip = !!lay.ref && lay.ref.x0 > 0.72;
  const enter = (id: string) => { setTip(id); onPreview(id); };
  const leave = () => { setTip(null); onPreview(null); };
  return (
    <figure className="wx-axis" aria-label="Career timeline">
      <div className="wx-axis-plot" style={{ height: h + 24 }}>
        <div className="wx-axis-lanes" style={{ height: h }}>
          {lay.ticks.map((t) => <span key={t.label} className="wx-gridline" style={{ left: `${t.x * 100}%` }} aria-hidden="true" />)}
          {lay.ref && (
            <span className="wx-refmark" style={{ left: `${lay.ref.x0 * 100}%`, width: `max(2px, ${(lay.ref.x1 - lay.ref.x0) * 100}%)` }} aria-hidden="true">
              <span className={`wx-reflab${flip ? " flip" : ""}`}>{refLabel}</span>
            </span>
          )}
          {lay.marks.map((m) => {
            const it = byId.get(m.id)!;
            return (
              <button key={m.id} type="button" className={`wx-mark${m.dot ? " dot" : ""}${it.run ? " run" : ""}${it.seen ? " seen" : ""}${selected === m.id ? " sel" : ""}${hot === m.id ? " hot" : ""}`}
                style={{ left: `${m.x0 * 100}%`, width: `${(m.x1 - m.x0) * 100}%`, top: 4 + m.lane * LANE }} aria-label={it.label} aria-pressed={selected === m.id}
                onClick={() => onPick(m.id)} onMouseEnter={() => enter(m.id)} onMouseLeave={leave} onFocus={() => enter(m.id)} onBlur={leave} />
            );
          })}
          {tm && <div className="wx-tip" role="tooltip" style={{ left: `${tx * 100}%`, top: 4 + tm.lane * LANE }}>{byId.get(tm.id)?.label}</div>}
        </div>
        <div className="wx-ticks" aria-hidden="true">
          {lay.ticks.map((t) => <span key={t.label} style={{ left: `${t.x * 100}%` }}>{t.label}</span>)}
        </div>
      </div>
    </figure>
  );
}
