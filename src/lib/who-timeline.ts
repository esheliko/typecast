import { parseDate } from "./who-dates";
import type { Range } from "./who-types";

/**
 * The career axis of a person's timeline: each credit drawn at the dates they appeared. Pure layout: positions come out as fractions
 * of the axis width (0..1) so any renderer can use them. Unit tested in tests/unit/who-timeline.test.ts.
 */
export interface TItem { id: string; start: string; end: string; /** Never merged into a cluster (the show being watched). */ solo?: boolean }
/** `ids` are the credits a mark stands for: one, or several close dots merged into one (`n` of them, `id` is the first). */
export interface TMark { id: string; ids: string[]; n: number; x0: number; x1: number; lane: number; dot: boolean }
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

const DOT = 1;        // a credit of a year or less is drawn as a dot; a longer run is a bar
const MIN_W = 0.028;  // the fraction of the axis a mark needs so it can be seen and tapped
const CLUSTER = 0.02; // dots whose centres are this close (a fraction of the axis) are merged into one

/** Pixel diameter of a dot standing for `n` credits: 12 for one, growing with the square root of the count (area follows the count). */
export const dotSize = (n: number) => Math.min(34, 12 + Math.round(5 * (Math.sqrt(Math.max(1, n)) - 1)));

export function layoutTimeline(items: TItem[], ref: Range | null): TLayout {
  const solo = new Set(items.filter((i) => i.solo).map((i) => i.id));
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
  const centre = (r: { a: number; b: number }) => x((r.a + r.b) / 2);
  const isDot = (r: { a: number; b: number; id: string }) => r.b - r.a < DOT && !solo.has(r.id);
  const bars = rows.filter((r) => !isDot(r));
  // Close dots become one dot (nearest first, each cluster no wider than CLUSTER from its first dot).
  const dots = rows.filter(isDot).sort((p, q) => p.a + p.b - (q.a + q.b));
  const groups: typeof dots[] = [];
  for (const d of dots) {
    const g = groups[groups.length - 1];
    if (g && centre(d) - centre(g[0]) <= CLUSTER) g.push(d); else groups.push([d]);
  }
  type Raw = { ids: string[]; x0: number; x1: number; dot: boolean };
  const raw: Raw[] = [
    ...bars.map((r): Raw => ({ ids: [r.id], x0: x(r.a), x1: Math.max(x(r.b), x(r.a) + MIN_W), dot: false })),
    ...groups.map((g): Raw => {
      const c = g.reduce((t, r) => t + centre(r), 0) / g.length;
      const half = (MIN_W * dotSize(g.length)) / 12 / 2;
      return { ids: g.sort((p, q) => p.a - q.a || p.b - q.b).map((r) => r.id), x0: c - half, x1: c + half, dot: true };
    }),
  ];
  const laneEnd: number[] = [];
  const marks: TMark[] = raw.sort((p, q) => p.x0 - q.x0 || p.x1 - q.x1).map((r) => {
    let lane = laneEnd.findIndex((end) => end + 0.004 <= r.x0);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(r.x1); } else laneEnd[lane] = r.x1;
    return { id: r.ids[0], ids: r.ids, n: r.ids.length, x0: r.x0, x1: r.x1, lane, dot: r.dot };
  });
  return {
    t0, t1,
    ticks: yearTicks(t0, t1).map((y) => ({ x: x(y), label: String(y) })),
    marks,
    ref: Number.isFinite(rs) ? { x0: x(rs), x1: Math.max(x(re), x(rs) + 0.004) } : null,
    lanes: laneEnd.length,
  };
}
