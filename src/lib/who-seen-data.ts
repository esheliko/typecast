import { getLibrary } from "./library";
import { seenIn } from "./episodes";
import { GUEST_EPS } from "./enrich";
import { getCreditEpisodes } from "./tmdb";
import { loadWhoPerson } from "./who-data";

/**
 * Which of `keys` (series that are Watching in the library WITH a saved place) the person already appeared in, at or before that place.
 * Their character name there is not a spoiler, so the Finder tile may say "Gas Pfender in Shameless" (docs/features/spoilers.md).
 * Conservative: only a guest part (<= GUEST_EPS episodes, TMDB lists them) with an episode at or before the place counts; no place, no list, or a
 * regular whose episodes we cannot list stays "not known". Library unreadable: nothing.
 */
export async function loadSeenWatching(pid: number, keys: string[]): Promise<string[]> {
  const lib = await getLibrary().catch(() => null);
  const want = new Map((lib ?? []).filter((l) => keys.includes(l.key) && l.key.startsWith("tv:") && l.status === "watching" && l.progress).map((l) => [l.key, l]));
  if (!want.size) return [];
  const p = await loadWhoPerson(pid);
  const hits = await Promise.all(p.credits.filter((c) => c.type === "tv" && want.has(c.key) && c.cids?.length && c.eps && c.eps <= GUEST_EPS).map(async (c) => {
    try { return seenIn(await getCreditEpisodes(c.cids), want.get(c.key)!)?.ep ? c.key : null; } catch { return null; }
  }));
  return [...new Set(hits.filter((k): k is string => !!k))];
}
