import { getCreditEpisodes, getPerson } from "./tmdb";
import { seenIn } from "./episodes";
import { heldHit, maskCreditItem } from "./spoiler-mask";
import type { CastMember, Credit, EnrichedMember, LibItem } from "./types";

/** Parts in a series this short are guest parts: TMDB lists their episodes, so we can tell which one you saw them in. */
export const GUEST_EPS = 12;

/** "You know them from" one title: for a series, the episode(s) you saw them in, or null when you have not reached them yet. */
async function hitOf(k: Credit, l: LibItem | undefined): Promise<EnrichedMember["hits"][number] | null> {
  const base = { key: k.key, title: k.title, year: k.year };
  // A series that is Watching is only named when the saved place shows they have appeared by then (seenIn below); never on the part size alone.
  if (heldHit(k, l) && (!k.cids?.length || !k.eps || k.eps > GUEST_EPS)) return null;
  if (k.type !== "tv" || !l || !k.cids?.length || !k.eps || k.eps > GUEST_EPS) return base;
  try {
    const where = seenIn(await getCreditEpisodes(k.cids), l);
    return where ? { ...base, ...where } : null;
  } catch { return heldHit(k, l) ? null : base; }
}

/** For each cast member, work out which titles the user has watched (not just listed to watch) they were in. Exact match by TMDB id. */
export async function enrich(people: CastMember[], library: LibItem[], curKey: string): Promise<EnrichedMember[]> {
  // "You know them from" means seen it: a title only on the watchlist is not one they know yet.
  const inLib = new Set(library.filter((l) => l.status !== "watchlist").map((l) => l.key));
  const byKey = new Map(library.map((l) => [l.key, l]));
  const queue = people.slice(0, 20);
  const out = new Map<number, EnrichedMember>();
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const p = await getPerson(c.id);
        const found = p.known.filter((k) => inLib.has(k.key) && k.key !== curKey);
        const named = await Promise.all(found.slice(0, 8).map((k) => hitOf(k, byKey.get(k.key))));
        const hits = [...named, ...found.slice(8).filter((k) => !heldHit(k, byKey.get(k.key))).map((k) => ({ key: k.key, title: k.title, year: k.year }))].filter((h): h is NonNullable<typeof h> => !!h);
        const hitKeys = new Set(hits.map((h) => h.key));
        const also = p.known.filter((k) => !inLib.has(k.key) && k.key !== curKey);
        // The expanded list must show every title named in "You know them from", so hits are never cut by the 10-title limit.
        const top = p.known.filter((k) => k.key !== curKey).slice(0, 10);
        const extra = found.filter((k) => hitKeys.has(k.key) && !top.some((t) => t.key === k.key));
        out.set(c.id, { ...c, hits, also: also.slice(0, 3).map((k) => k.title), top: [...top, ...extra].map((k) => maskCreditItem(k, byKey.get(k.key)?.status)) });
      } catch { /* leave this person without extras */ }
    }
  }
  await Promise.all(Array.from({ length: 20 }, worker));
  return people.map((c) => out.get(c.id) ?? { ...c, hits: [], also: [], top: [] });
}
