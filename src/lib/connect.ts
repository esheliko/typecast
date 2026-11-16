import { getAllCredits, getCast, getTitle } from "./tmdb";
import { rankCands, whyLine, type Cand } from "./connect-suggest";
import type { Bridge, Credit, Item, LibItem, MediaType, PeopleLink, PersonLite, Regular, SharedActor, SuggestedPerson, SuggestedTitle, TitlesLink } from "./types";

/** Run `fn` over `list` with at most `n` requests in flight. Failures are dropped. */
export async function pool<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
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
      const res = await pool(top(list), 10, (k) => getCast(k.type, k.id, 30));
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
  const titles = await pool(seen, 12, (l) => getTitle(l.type, l.id));
  const map = new Map<number, Regular>();
  titles.forEach((t) => t?.people.slice(0, 15).forEach((c) => {
    const r = map.get(c.id) ?? { ...lite(c), titles: [] };
    r.titles.push({ key: t.key, title: t.title, role: c.role });
    map.set(c.id, r);
  }));
  return [...map.values()].filter((r) => r.titles.length > 1).sort((x, y) => y.titles.length - x.titles.length).slice(0, 12);
}

/** The titles the user has seen (top-billed cast loaded), and how many of them each actor is in. */
async function libraryCast(lib: LibItem[]) {
  const seen = lib.filter((l) => l.status !== "watchlist").slice(0, 40);
  const titles = (await pool(seen, 12, (l) => getTitle(l.type, l.id))).filter((t): t is NonNullable<typeof t> => !!t);
  const count = new Map<number, number>();
  titles.forEach((t) => t.people.slice(0, 15).forEach((c) => count.set(c.id, (count.get(c.id) ?? 0) + 1)));
  return { titles, count };
}

/** First-pick suggestions for "Two titles": titles of yours whose cast overlaps the rest of your library the most. */
export async function suggestTitles(lib: LibItem[]): Promise<SuggestedTitle[]> {
  const { titles, count } = await libraryCast(lib);
  const cands: Cand<SuggestedTitle>[] = titles.map((t) => {
    const shared = t.people.slice(0, 15).filter((c) => (count.get(c.id) ?? 0) > 1);
    return { item: { key: t.key, type: t.type, id: t.id, title: t.title, year: t.year, poster: t.poster, why: "" }, links: shared.length, via: shared.map((c) => c.name), mine: 0 };
  });
  return rankCands(cands, 10).map((c) => ({ ...c.item, why: c.links === 1 ? `1 actor also in your other titles: ${c.via[0]}` : `${c.links} actors also in your other titles: ${c.via.slice(0, 3).join(", ")}` }));
}

/**
 * Second-pick suggestions. People: co-stars of the first person (most shared titles first) and people from your library.
 * Titles: titles sharing the most actors with the first title, and titles in your library.
 */
export async function suggestSecond(mode: "people" | "titles", a: { type?: MediaType; id: number }, lib: LibItem[]): Promise<{ people: SuggestedPerson[] } | { titles: SuggestedTitle[] }> {
  if (mode === "people") {
    const [cr, mineData] = await Promise.all([getAllCredits(a.id), libraryCast(lib)]);
    const top = cr.known.slice(0, 15);
    const casts = await pool(top, 10, (k) => getCast(k.type, k.id, 30));
    const map = new Map<number, Cand<PersonLite>>();
    const at = (p: PersonLite) => { let c = map.get(p.id); if (!c) { c = { item: lite(p), links: 0, via: [], mine: mineData.count.get(p.id) ?? 0 }; map.set(p.id, c); } return c; };
    casts.forEach((cast, i) => cast?.forEach((p) => { if (p.id === a.id) return; const c = at(p); c.links++; if (c.via.length < 4) c.via.push(top[i].title); }));
    mineData.titles.forEach((t) => t.people.slice(0, 15).forEach((p) => { if (p.id !== a.id) at(p); }));
    const out = rankCands([...map.values()], 8).map((c) => ({ ...c.item, why: whyLine(c, cr.name, "title") }));
    return { people: out };
  }
  const type = a.type ?? "movie";
  const cast = await getCast(type, a.id, 12);
  const credits = await pool(cast, 10, (p) => getAllCredits(p.id));
  const map = new Map<string, Cand<SuggestedTitle>>();
  const inLib = new Set(lib.map((l) => l.key));
  const self = `${type}:${a.id}`;
  credits.forEach((cr, i) => cr?.known.slice(0, 80).forEach((k) => {
    if (k.key === self) return;
    const c = map.get(k.key) ?? { item: { key: k.key, type: k.type, id: k.id, title: k.title, year: k.year, poster: k.poster, why: "" }, links: 0, via: [], mine: inLib.has(k.key) ? 1 : 0 };
    c.links++; if (c.via.length < 4) c.via.push(cast[i].name);
    map.set(k.key, c);
  }));
  lib.filter((l) => l.key !== self).forEach((l) => { if (!map.has(l.key)) map.set(l.key, { item: { key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, why: "" }, links: 0, via: [], mine: 1 }); });
  return { titles: rankCands([...map.values()], 8).map((c) => ({ ...c.item, why: whyLine(c, "", "actor") })) };
}
