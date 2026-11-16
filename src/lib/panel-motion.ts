/**
 * Motion for the Library's Watch next / Upcoming panels. The page is laid out ONCE at its final size and the move is only
 * painted: the panel is revealed with a clip, and everything below it slides with a transform. So nothing reflows while it
 * animates (no per-frame layout, sub-pixel smooth) and nothing waits for a mount: the first frame already moves.
 *
 * Pure DOM, no React. Panels are `.collapse` elements inside one `.lib-top`; "below" is every later sibling of `.lib-top`.
 * An open panel keeps its full height in the layout; `hide = (1 - e) * h` of it is covered / shifted away while e < 1.
 * A closing panel stays in the layout until its animation ends, then it is hidden and the shift resets in the same frame.
 */
export const PANEL_MS = 260;

type P = { el: HTMLElement; h: number; e: number; from: number; to: number; t0: number | null; ms: number };
type Group = { panels: Map<HTMLElement, P>; raf: number };
const groups = new WeakMap<Element, Group>();

/** cubic-bezier(.37, 0, .63, 1) (ease-in-out sine): starts from rest, so the first frame barely moves, and peaks at only ~1.6x the average speed. */
const bez = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) { const d = ((ax * t + bx) * t + cx) * t - x; const s = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(d) < 1e-5 || !s) break; t -= d / s; }
    t = Math.min(1, Math.max(0, t));
    return ((ay * t + by) * t + cy) * t;
  };
};
const ease = bez(0.37, 0, 0.63, 1);

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const after = (top: Element) => { const out: HTMLElement[] = []; for (let n = top.nextElementSibling; n; n = n.nextElementSibling) if (n instanceof HTMLElement) out.push(n); return out; };

function paint(top: Element, g: Group) {
  const order = [...top.querySelectorAll<HTMLElement>(".collapse")].filter((el) => g.panels.has(el));
  const moving = order.filter((el) => g.panels.get(el)!.from !== g.panels.get(el)!.to);
  let shift = 0;
  if (moving.length > 1) {
    // A SWITCH (one panel closing while another opens): stack both on the same spot under the headers and cross-fade them
    // while the shared height eases from one to the other. Nothing slides sideways or up while the page below grows or shrinks.
    let full = 0, seen = 0;
    for (const el of order) full += g.panels.get(el)!.h;
    for (const el of order) seen += g.panels.get(el)!.e * g.panels.get(el)!.h;
    let above = 0;
    for (const el of order) {
      const p = g.panels.get(el)!;
      el.style.transform = above ? `translateY(${-above}px)` : "";
      const crop = Math.max(0, p.h - seen);
      el.style.clipPath = crop > 0.01 ? `inset(0 -16px ${crop}px -16px)` : "";
      el.style.opacity = String(Math.min(1, Math.max(0, (p.e - 0.5) / 0.5))); // fully out by the half way point, the other fades in after it
      above += p.h;
    }
    shift = full - seen;
  } else {
    for (const el of order) {
      const p = g.panels.get(el)!;
      const hide = (1 - p.e) * p.h; // how much of this panel is not shown yet
      el.style.transform = shift ? `translateY(${-shift}px)` : "";
      el.style.clipPath = hide > 0.01 ? `inset(0 -16px ${hide}px -16px)` : "";
      el.style.opacity = p.e < 1 ? String(Math.min(1, p.e * 1.6)) : "";
      shift += hide;
    }
  }
  for (const b of after(top)) { b.style.transform = shift ? `translateY(${-shift}px)` : ""; b.style.willChange = "transform"; b.style.overflowAnchor = "none"; }
  return shift;
}

function clear(top: Element) {
  for (const b of after(top)) { b.style.transform = ""; b.style.willChange = ""; b.style.overflowAnchor = ""; }
}

function frame(top: Element, g: Group, ts: number) {
  g.raf = 0;
  for (const [el, p] of g.panels) {
    if (p.t0 === null) p.t0 = ts; // the clock starts at the first painted frame, so a slow click never skips the start
    const t = Math.min(1, (ts - p.t0) / p.ms);
    p.e = p.from + (p.to - p.from) * ease(t);
    if (t >= 1) {
      p.e = p.to;
      if (p.to === 0) el.hidden = true; // leaves the layout now; the shift resets in the same frame below
      el.inert = false;
      el.style.transform = el.style.clipPath = el.style.opacity = "";
      g.panels.delete(el);
    }
  }
  paint(top, g);
  if (g.panels.size) g.raf = requestAnimationFrame((n) => frame(top, g, n));
  else clear(top);
}

/** Show or hide a panel. `animate` false (first render, reduced motion) just flips it. */
export function setPanel(el: HTMLElement, open: boolean, animate = true) {
  const top = el.closest(".lib-top");
  if (!top || !animate || reduced()) {
    el.hidden = !open;
    if (top) { const g = groups.get(top); g?.panels.delete(el); if (g && !g.panels.size) { cancelAnimationFrame(g.raf); clear(top); } }
    el.style.transform = el.style.clipPath = el.style.opacity = "";
    return;
  }
  let g = groups.get(top);
  if (!g) { g = { panels: new Map(), raf: 0 }; groups.set(top, g); }
  const cur = g.panels.get(el);
  if (!cur && el.hidden === !open) return; // already there
  if (open) el.hidden = false; // joins the layout at its FINAL size right now
  const h = el.getBoundingClientRect().height; // fractional, like the layout (offsetHeight rounds, which made the first frame nudge the wrong way)
  const e = cur ? cur.e : open ? 0 : 1;
  const to = open ? 1 : 0;
  g.panels.set(el, { el, h, e, from: e, to, t0: null, ms: Math.max(140, PANEL_MS * Math.abs(to - e)) }); // reversing partway keeps the same speed instead of restarting a full slide
  el.inert = !open;
  paint(top, g); // same task as the click: the first painted frame already matches what was on screen
  if (!g.raf) g.raf = requestAnimationFrame((n) => frame(top, g!, n));
}
