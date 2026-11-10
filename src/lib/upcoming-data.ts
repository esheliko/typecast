import { getUpcomingFacts } from "./tmdb";
import { releaseFor } from "./release-dates";
import { tzOf } from "./today";
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
export async function loadUpcoming(lib: LibItem[], profile: Pick<Profile, "country" | "services">, now = Date.now()): Promise<UpEntry[]> {
  const today = dayOf(now, tzOf(profile.country));
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
    const facts: UpFacts = { date: releaseFor(f.byCountry, profile.country, f.date), s: f.s, e: f.e, epName: f.epName, svc };
    const e = buildEntry(l, facts, today);
    if (e) out.push(e);
  }
  return out.sort(byDate);
}

/** Whether the library holds anything worth asking TMDB about, so the page can show a placeholder only when something may appear. */
export const hasUpcomingCandidates = (lib: LibItem[], country?: string, now = Date.now()) => candidates(lib, dayOf(now, tzOf(country)), 1).length > 0;

/**
 * The one upcoming date of a single title for the user's country, for "Add to calendar". Null when TMDB has no future date.
 * Asks TMDB itself: the browser only says which title.
 */
export async function upcomingFor(type: "movie" | "tv", id: number, country: string, now = Date.now()): Promise<UpEntry | null> {
  const f = await getUpcomingFacts(type, id);
  const l = { key: `${type}:${id}`, type, id, title: f.title, year: "", poster: null, status: "watchlist", priority: "someday" } as LibItem;
  return buildEntry(l, { date: releaseFor(f.byCountry, country, f.date), s: f.s, e: f.e, epName: f.epName }, dayOf(now, tzOf(country)));
}
