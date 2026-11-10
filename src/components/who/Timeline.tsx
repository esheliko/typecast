"use client";
import { useMemo } from "react";
import { layoutTimeline, type TItem } from "@/lib/who-timeline";
import type { Range } from "@/lib/who-types";

export interface AxisItem extends TItem { label: string; run?: boolean; dim?: boolean }

/**
 * The career axis: a horizontal year scale, each credit drawn where THEY appeared (a bar for a run, a dot for a single appearance),
 * and a gold marker for what is being watched (or whichever row was chosen as the reference). Marks are buttons that jump to their row.
 */
export function Timeline({ items, refRange, refLabel, hot, onPick }: { items: AxisItem[]; refRange: Range | null; refLabel: string; hot: string | null; onPick: (id: string) => void }) {
  const lay = useMemo(() => layoutTimeline(items, refRange), [items, refRange]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const LANE = 22;
  const h = Math.max(1, lay.lanes) * LANE + 8;
  if (!items.length && !refRange) return null;
  return (
    <figure className="wx-axis" aria-label="Career timeline">
      <div className="wx-axis-plot" style={{ height: h + 24 }}>
        <div className="wx-axis-lanes" style={{ height: h }}>
          {lay.ticks.map((t) => <span key={t.label} className="wx-gridline" style={{ left: `${t.x * 100}%` }} aria-hidden="true" />)}
          {lay.ref && (
            <span className="wx-refmark" style={{ left: `${lay.ref.x0 * 100}%`, width: `max(2px, ${(lay.ref.x1 - lay.ref.x0) * 100}%)` }} aria-hidden="true">
              <span className="wx-reflab">{refLabel}</span>
            </span>
          )}
          {lay.marks.map((m) => {
            const it = byId.get(m.id)!;
            return (
              <button key={m.id} type="button" className={`wx-mark${m.dot ? " dot" : ""}${it.run ? " run" : ""}${it.dim ? " dim" : ""}${hot === m.id ? " hot" : ""}`}
                style={{ left: `${m.x0 * 100}%`, width: `${(m.x1 - m.x0) * 100}%`, top: 4 + m.lane * LANE }} title={it.label} aria-label={it.label} onClick={() => onPick(m.id)} />
            );
          })}
        </div>
        <div className="wx-ticks" aria-hidden="true">
          {lay.ticks.map((t) => <span key={t.label} style={{ left: `${t.x * 100}%` }}>{t.label}</span>)}
        </div>
      </div>
    </figure>
  );
}
