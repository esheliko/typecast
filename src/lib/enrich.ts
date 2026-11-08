import { getPerson } from "./tmdb";
import type { CastMember, EnrichedMember, LibItem } from "./types";

/** For each cast member, work out which titles the user has watched (not just listed to watch) they were in. Exact match by TMDB id. */
export async function enrich(people: CastMember[], library: LibItem[], curKey: string): Promise<EnrichedMember[]> {
  // "You know them from" means seen it: a title only on the watchlist is not one they know yet.
  const inLib = new Set(library.filter((l) => l.status !== "watchlist").map((l) => l.key));
  const queue = people.slice(0, 20);
  const out = new Map<number, EnrichedMember>();
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const p = await getPerson(c.id);
        const hits = p.known.filter((k) => inLib.has(k.key) && k.key !== curKey);
        const also = p.known.filter((k) => !inLib.has(k.key) && k.key !== curKey);
        // The expanded list must show every title named in "You know them from", so hits are never cut by the 10-title limit.
        const top = p.known.filter((k) => k.key !== curKey).slice(0, 10);
        const extra = hits.filter((k) => !top.some((t) => t.key === k.key));
        out.set(c.id, { ...c, hits: hits.map((k) => ({ key: k.key, title: k.title, year: k.year })), also: also.slice(0, 3).map((k) => k.title), top: [...top, ...extra] });
      } catch { /* leave this person without extras */ }
    }
  }
  await Promise.all(Array.from({ length: 20 }, worker));
  return people.map((c) => out.get(c.id) ?? { ...c, hits: [], also: [], top: [] });
}
