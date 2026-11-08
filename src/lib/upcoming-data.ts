import { getUpcomingFacts } from "./tmdb";
import { buildEntry, candidates, dayOf, byDate, type UpEntry, type UpFacts } from "./upcoming";
import type { LibItem, Profile } from "./types";

/** Runs `fn` over `xs`, `n` at a time. */
async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]); } }));
  return out;
}

/**
 * What is coming from the user's library: unreleased films and the next episode of series. At most MAX_LOOKUPS titles are asked about,
 * 12 at a time, each cached by TMDB's fetch cache. A title whose lookup fails is simply left out. Sorted by date.
 */
export async function loadUpcoming(lib: LibItem[], profile: Profile, now = Date.now()): Promise<UpEntry[]> {
  const today = dayOf(now);
  const mine = new Set(profile.services);
  const got = await pool(candidates(lib, today), 12, async (l) => {
    try { return [l, await getUpcomingFacts(l.type, l.id)] as const; } catch { return null; }
  });
  const out: UpEntry[] = [];
  for (const r of got) {
    if (!r) continue;
    const [l, f] = r;
    // The user's own services come first; otherwise any flat-rate service in their country.
    const here = f.prov[profile.country] ?? [];
    const svc = (here.find((p) => mine.has(p.id)) ?? here[0])?.name ?? null;
    const facts: UpFacts = { date: f.date, s: f.s, e: f.e, epName: f.epName, svc };
    const e = buildEntry(l, facts, today);
    if (e) out.push(e);
  }
  return out.sort(byDate);
}

/** Whether the library holds anything worth asking TMDB about, so the page can show a placeholder only when something may appear. */
export const hasUpcomingCandidates = (lib: LibItem[], now = Date.now()) => candidates(lib, dayOf(now), 1).length > 0;
