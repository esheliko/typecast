import { getAllCredits, getCast, getTitle } from "./tmdb";
import type { Bridge, Credit, Item, LibItem, MediaType, PeopleLink, Regular, SharedActor, TitlesLink } from "./types";

/** Run `fn` over `list` with at most `n` requests in flight. Failures are dropped. */
async function pool<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(list.length).fill(null);
  let i = 0;
  async function worker() { for (let j = i++; j < list.length; j = i++) { try { out[j] = await fn(list[j]); } catch { /* skip */ } } }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
  return out;
}

const lite = (p: { id: number; name: string; photo: string | null }) => ({ id: p.id, name: p.name, photo: p.photo });

/**
 * What two people have in common: titles they were both in, and when there are none,
 * co-stars who link them (A worked with X in one title, X worked with B in another).
 */
export async function linkPeople(aId: number, bId: number): Promise<PeopleLink> {
  const [a, b] = await Promise.all([getAllCredits(aId), getAllCredits(bId)]);
  const bByKey = new Map(b.known.map((k) => [k.key, k]));
  const shared = a.known.filter((k) => bByKey.has(k.key))
    .map((k) => ({ key: k.key, type: k.type, id: k.id, title: k.title, year: k.year, poster: k.poster, votes: k.votes, roles: [k.role, bByKey.get(k.key)!.role] as [string, string] }))
    .sort((x, y) => (y.year || "0").localeCompare(x.year || "0"));

  let bridges: Bridge[] = [];
  if (shared.length === 0) {
    const top = (list: Credit[]) => list.slice(0, 10);
    const casts = async (list: Credit[]) => {
      const res = await pool(top(list), 6, (k) => getCast(k.type, k.id, 30));
      const seen = new Map<number, { person: ReturnType<typeof lite>; via: Credit }>();
      res.forEach((cast, i) => cast?.forEach((c) => { if (!seen.has(c.id)) seen.set(c.id, { person: lite(c), via: top(list)[i] }); }));
      return seen;
    };
    const [fromA, fromB] = await Promise.all([casts(a.known), casts(b.known)]);
    for (const [id, x] of fromA) {
      if (id === aId || id === bId) continue;
      const y = fromB.get(id);
      if (y) bridges.push({ person: x.person, viaA: x.via, viaB: y.via });
    }
    bridges = bridges.sort((p, q) => q.viaA.votes + q.viaB.votes - (p.viaA.votes + p.viaB.votes)).slice(0, 8);
  }
  return { a: lite(a), b: lite(b), shared, bridges };
}

/** Actors who appear in both titles. */
export async function linkTitles(a: { type: MediaType; id: number }, b: { type: MediaType; id: number }): Promise<TitlesLink> {
  const [ta, tb, ca, cb] = await Promise.all([getTitle(a.type, a.id), getTitle(b.type, b.id), getCast(a.type, a.id, 200), getCast(b.type, b.id, 200)]);
  const inB = new Map(cb.map((c) => [c.id, c]));
  const shared: SharedActor[] = ca.filter((c) => inB.has(c.id)).map((c) => ({ ...lite(c), roles: [c.role, inB.get(c.id)!.role] }));
  const asItem = (t: Item): Item => ({ key: t.key, type: t.type, id: t.id, title: t.title, year: t.year, poster: t.poster });
  return { a: asItem(ta), b: asItem(tb), shared };
}

/** Actors who keep turning up in what the user has watched or is watching. Only the top-billed cast of each title counts. */
export async function regulars(lib: LibItem[]): Promise<Regular[]> {
  const seen = lib.filter((l) => l.status !== "watchlist").slice(0, 40);
  const titles = await pool(seen, 6, (l) => getTitle(l.type, l.id));
  const map = new Map<number, Regular>();
  titles.forEach((t) => t?.people.slice(0, 15).forEach((c) => {
    const r = map.get(c.id) ?? { ...lite(c), titles: [] };
    r.titles.push({ key: t.key, title: t.title, role: c.role });
    map.set(c.id, r);
  }));
  return [...map.values()].filter((r) => r.titles.length > 1).sort((x, y) => y.titles.length - x.titles.length).slice(0, 12);
}
