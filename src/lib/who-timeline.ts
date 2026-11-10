import { parseDate } from "./who-dates";
import type { Range } from "./who-types";

/**
 * The career axis of a person's timeline: each credit drawn at the dates they appeared. Pure layout: positions come out as fractions
 * of the axis width (0..1) so any renderer can use them. Unit tested in tests/unit/who-timeline.test.ts.
 */
export interface TItem { id: string; start: string; end: string }
export interface TMark { id: string; x0: number; x1: number; lane: number; dot: boolean }
export interface TTick { x: number; label: string }
export interface TLayout { t0: number; t1: number; ticks: TTick[]; marks: TMark[]; ref: { x0: number; x1: number } | null; lanes: number }

/** A date as a decimal year (2008.87). */
export function decimalYear(s: string): number {
  const p = parseDate(s);
  if (!p) return NaN;
  return p.y + (p.m - 1) / 12 + (p.d - 1) / 372;
}

const STEPS = [1, 2, 5, 10, 20, 25, 50];
/** Ticks at round years across [t0, t1], at most about `max` of them. */
export function yearTicks(t0: number, t1: number, max = 7): number[] {
  const span = Math.max(1, t1 - t0);
  const step = STEPS.find((s) => span / s <= max) ?? 100;
  const out: number[] = [];
  for (let y = Math.ceil(t0 / step) * step; y <= t1; y += step) out.push(y);
  return out;
}

const DOT = 0.07;     // a credit shorter than this (years) is drawn as a dot
const MIN_W = 0.028;  // the fraction of the axis a mark needs so it can be seen and tapped

export function layoutTimeline(items: TItem[], ref: Range | null): TLayout {
  const rows = items.map((i) => ({ id: i.id, a: decimalYear(i.start), b: decimalYear(i.end) })).filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b))
    .map((r) => ({ ...r, b: Math.max(r.a, r.b) }));
  const rs = ref ? decimalYear(ref.start) : NaN, re = ref ? Math.max(rs, decimalYear(ref.end)) : NaN;
  const all = [...rows.flatMap((r) => [r.a, r.b]), ...(Number.isFinite(rs) ? [rs, re] : [])];
  if (!all.length) return { t0: 0, t1: 1, ticks: [], marks: [], ref: null, lanes: 0 };
  let t0 = Math.min(...all), t1 = Math.max(...all);
  if (t1 - t0 < 3) { const mid = (t0 + t1) / 2; t0 = mid - 1.5; t1 = mid + 1.5; }
  const pad = (t1 - t0) * 0.04;
  t0 -= pad; t1 += pad;
  const w = t1 - t0;
  const x = (t: number) => (t - t0) / w;
  const laneEnd: number[] = [];
  const marks: TMark[] = [...rows].sort((p, q) => p.a - q.a || p.b - q.b).map((r) => {
    const dot = r.b - r.a < DOT;
    let x0 = x(r.a), x1 = x(r.b);
    if (dot) { const c = (x0 + x1) / 2; x0 = c - MIN_W / 2; x1 = c + MIN_W / 2; }
    else if (x1 - x0 < MIN_W) x1 = x0 + MIN_W;
    let lane = laneEnd.findIndex((end) => end + 0.004 <= x0);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(x1); } else laneEnd[lane] = x1;
    return { id: r.id, x0, x1, lane, dot };
  });
  return {
    t0, t1,
    ticks: yearTicks(t0, t1).map((y) => ({ x: x(y), label: String(y) })),
    marks,
    ref: Number.isFinite(rs) ? { x0: x(rs), x1: Math.max(x(re), x(rs) + 0.004) } : null,
    lanes: laneEnd.length,
  };
}
