/**
 * The popup's trail: every title / person opened inside one popup, in order, with where we are now.
 * Pure list logic (no React, no browser) so it is unit tested; the Modal frame keeps one and draws it.
 */
export type TrailStep = { url: string; label: string };
export type Trail = { steps: TrailStep[]; i: number };

export const trailStart = (s: TrailStep): Trail => ({ steps: [s], i: 0 });

/** Shorten a label for a chip (the chip also ellipsises in CSS; this keeps a pathological name from bloating the DOM). */
export const crumbLabel = (s: string, max = 40): string => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t || "…";
};

/**
 * The browser landed on `url`. `want` is the step index a crumb asked to jump to: if that step is the page we landed on, we are there.
 * Otherwise it is the same step again, one Back / Forward, or a new step: a new step drops whatever lay ahead (branching, as the browser does).
 * Returns the same object when nothing changed.
 */
export function visit(t: Trail, step: TrailStep, want: number | null = null): Trail {
  const { steps, i } = t;
  if (want !== null && steps[want]?.url === step.url) return want === i ? t : { steps, i: want };
  if (steps[i]?.url === step.url) return t;
  if (steps[i - 1]?.url === step.url) return { steps, i: i - 1 };
  if (steps[i + 1]?.url === step.url) return { steps, i: i + 1 };
  return { steps: [...steps.slice(0, i + 1), step], i: i + 1 };
}

/** Fix the label of the current step once the page knows the real name; no change (same object) when it is the same. */
export function relabel(t: Trail, label: string): Trail {
  const l = label.trim();
  if (!l || t.steps[t.i]?.label === l) return t;
  return { steps: t.steps.map((s, k) => (k === t.i ? { ...s, label: l } : s)), i: t.i };
}

/** The trail is only worth showing from the third step on (two steps are just Back and Forward). */
export const showTrail = (t: Trail): boolean => t.steps.length >= 3;

/** How many history entries to move to reach step `to` from where we are (negative = back). 0 = already there. */
export const jumpBy = (t: Trail, to: number): number => (to >= 0 && to < t.steps.length ? to - t.i : 0);
