/**
 * "Passed over" memory for Browse. A poster you had a proper look at and then scrolled past without marking, skipping or
 * opening is probably not for you, so each time that happens it gets less likely to show up again. Kept on this device,
 * like the manual "Not interested" list. Pure helpers, no React.
 */

const KEY = "typecast.passed";
const MAX_ENTRIES = 4000;
const MAX_COUNT = 8;
/** One pass is forgiven after this long, so a title you ignored a year ago gets another chance. */
const FORGIVE_MS = 21 * 24 * 3600 * 1000;
/** Chance of showing a title again falls by this factor for every time it was passed over. */
const FALLOFF = 0.55;
const FLOOR = 0.04;

/** key -> [times passed over, when last]. */
export type Passed = Map<string, [number, number]>;

export function loadPassed(): Passed {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const out: Passed = new Map();
    if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) && v[0] > 0) out.set(k, [Math.min(MAX_COUNT, v[0]), v[1]]);
    }
    return out;
  } catch { return new Map(); }
}

function save(p: Passed) {
  // Keep the most recent entries when the list gets long.
  const entries = p.size > MAX_ENTRIES ? [...p.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, MAX_ENTRIES) : [...p.entries()];
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* storage unavailable */ }
}

/** Another pass-over of these titles. Reads fresh from storage, so several tabs do not overwrite each other. */
export function recordPassed(keys: string[], now = Date.now()) {
  if (!keys.length) return;
  const p = loadPassed();
  for (const k of keys) p.set(k, [Math.min(MAX_COUNT, (effective(p.get(k), now) + 1)), now]);
  save(p);
}

/** You showed interest (opened it, marked it, skipped it): forget the passes. */
export function clearPassed(key: string) {
  const p = loadPassed();
  if (p.delete(key)) save(p);
}

function effective(e: [number, number] | undefined, now: number) {
  return e ? Math.max(0, e[0] - Math.floor((now - e[1]) / FORGIVE_MS)) : 0;
}

/** Chance (0..1) that a title should still be shown: 1 if never passed over, then 55%, 30%, 17%… down to a small floor. */
export function showChance(e: [number, number] | undefined, now = Date.now()) {
  const n = effective(e, now);
  return n === 0 ? 1 : Math.max(FLOOR, FALLOFF ** n);
}

/** Stable pseudo-random number in [0, 1) for a title and a seed, so the same visit always makes the same choice. */
export function roll(key: string, salt: number) {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}

/** Whether a title that was passed over before is left out of this visit. */
export const faded = (passed: Passed, key: string, salt: number) => roll(key, salt) >= showChance(passed.get(key));
