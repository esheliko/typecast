import { browse, browseItem, genreList, getTitleImdbId, tmdb } from "./tmdb";
import { getImdbRatings, hasOmdbKey } from "./imdb-rating";
import { interleave } from "./browse";
import { buildProfile, extraParam, howOf, parseExtras, personMatches, posWeight, rerank, sampleSeeds, scorePool, seedWeight, topGenres, whyText, type Cand, type How, type Pooled, type Seed } from "./foryou-rank";
import type { BrowseItem, BrowseType, LibItem, MediaType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGE = 20;
const SEEDS = 10;
const ANCHORS = 3;
const WEEK = 7 * 24 * 3600;
/** How many of the best-ranked titles get their IMDb score looked up (cached a day) and are ranked again on it. */
const SHORTLIST = 60;
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/** Waits for `p`, but never longer than `ms`: whatever has arrived by then is used. */
const withBudget = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);

/** Small deterministic generator, so every page of one visit draws from the same picks but a refresh draws different ones. */
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2 ** 32; }; }

const yearOf = (r: any) => +String(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || 0;
const toCand = (r: any): Cand => ({ id: r.id, genres: r.genre_ids ?? (r.genres ?? []).map((g: any) => g.id), lang: r.original_language ?? "", year: yearOf(r), avg: r.vote_average ?? 0, votes: r.vote_count ?? 0, pop: r.popularity ?? 0 });

/** A title's TMDB record with its keywords and people on the same call (one request), cached for a week. */
const detail = (type: MediaType, id: number) => tmdb(`/${type}/${id}`, { append_to_response: extraParam(type) }, WEEK);
const withExtras = (type: MediaType, d: any): Cand => ({ ...toCand(d), ...parseExtras(d, type) });

/** A library title with the facts the ranking needs (genres, language, year, keywords, people); cached for a week. */
async function describe(l: LibItem, w: number): Promise<Seed & { l: LibItem }> {
  const d = await detail(l.type, l.id).catch(() => null);
  return { key: l.key, id: l.id, w, l, cand: d ? withExtras(l.type, d) : null };
}

/**
 * Picks for you (ranking rules: src/lib/foryou-rank.ts). Candidates come from TMDB's recommendations for titles you
 * loved (weighted by how much, how recently) plus a few well-rated titles in your favourite genres and a few outside them.
 * They are scored on agreement between seeds, fit with your taste profile, quality, and distance from what you disliked,
 * then ordered so neighbours differ. Anything already in your library is left out. When the pool runs out the list
 * continues with popular titles in your favourite genres, so it never ends.
 */
export async function forYou(type: BrowseType, page: number, lib: LibItem[], salt: number, region?: { country: string; services: number[] }): Promise<{ items: BrowseItem[]; more: boolean; notice?: string }> {
  if (type === "all") {
    const [m, t] = await Promise.all([forYou("movie", page, lib, salt, region), forYou("tv", page, lib, salt, region)]);
    return { items: interleave(m.items, t.items), more: m.more || t.more, notice: m.notice ?? t.notice };
  }
  const now = Date.now();
  const mine = lib.filter((l) => l.type === type).map((l) => ({ l, w: seedWeight(l, now) }));
  const liked = sampleSeeds(mine.filter((x) => x.w > 0), SEEDS, ANCHORS, rng(salt));
  if (!liked.length) {
    const r = await browse("popular", type, page);
    return { ...r, notice: "Mark a few titles you have watched or want to watch and this list turns into picks based on them. Showing popular for now." };
  }
  const disliked = mine.filter((x) => x.w < 0).sort((a, b) => a.w - b.w).slice(0, 6);
  const [likedD, dislikedD] = await Promise.all([
    Promise.all(liked.map((x) => describe(x.l, x.w))), Promise.all(disliked.map((x) => describe(x.l, x.w))),
  ]);
  // Taste comes from the whole strong set, not just the few drawn for recommendations.
  const like = buildProfile(likedD), dislike = buildProfile(dislikedD, -1);
  const lean = topGenres(like, 2), outside = topGenres(like, 8).slice(3);

  const own = new Set(lib.map((l) => l.key));
  const date = type === "movie" ? "primary_release_date" : "first_air_date";
  const base = { include_adult: "false", sort_by: "vote_average.desc", "vote_count.gte": "400", "vote_average.gte": "7" };
  // People you keep coming back to: who they are, and which of your titles they were in (strongest seed first).
  const personName = new Map<number, string>(), personIn = new Map<number, string[]>();
  for (const s of [...likedD].sort((a, b) => b.w - a.w)) for (const x of s.cand?.people ?? []) {
    personName.set(x.id, x.name); personIn.set(x.id, [...(personIn.get(x.id) ?? []), s.l.title]);
  }
  const favPeople = [...like.person.entries()].filter(([, w]) => w >= 2.4).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const onSvc = region?.services.length && region.country;
  const [names, recs, gems, wild, byPeople, onServices] = await Promise.all([
    genreList(type).catch(() => []),
    Promise.all(likedD.flatMap((s, i) => (i < 4 ? [1, 2] : [1]).map((p) =>
      tmdb(`/${type}/${s.id}/recommendations`, { page: String(p) }).then((d) => ({ sid: s.id, w: s.w, off: (p - 1) * 20, rs: (d.results ?? []) as any[] })).catch(() => ({ sid: 0, w: 0, off: 0, rs: [] as any[] }))))),
    lean.length ? tmdb(`/discover/${type}`, { ...base, with_genres: lean.join("|") }, 6 * 3600).then((d) => (d.results ?? []) as any[]).catch(() => [] as any[]) : [],
    outside.length ? tmdb(`/discover/${type}`, { ...base, "vote_count.gte": "800", "vote_average.gte": "7.3", with_genres: outside.slice(0, 3).join("|") }, 6 * 3600).then((d) => (d.results ?? []) as any[]).catch(() => [] as any[]) : [],
    // The best-known other work of those people (a person's filmography changes slowly: cached a week).
    Promise.all(favPeople.map(([id, w]) => tmdb(`/person/${id}/combined_credits`, {}, WEEK).then((d) => ({
      id, w, rs: [...(d.cast ?? []), ...((d.crew ?? []) as any[]).filter((c) => c.job === "Director")].filter((r: any) => r.media_type === type && (r.vote_count ?? 0) >= 300 && (r.vote_average ?? 0) >= 6.8)
        .sort((a: any, b: any) => (b.vote_count ?? 0) - (a.vote_count ?? 0)).slice(0, 6) as any[],
    })).catch(() => ({ id, w, rs: [] as any[] })))),
    // Good titles you can actually stream today, in the genres you lean towards.
    onSvc ? tmdb(`/discover/${type}`, { ...base, "vote_count.gte": "300", ...(lean.length ? { with_genres: lean.join("|") } : {}), watch_region: region!.country, with_watch_providers: region!.services.join("|"), with_watch_monetization_types: "flatrate" }, 6 * 3600).then((d) => (d.results ?? []) as any[]).catch(() => [] as any[]) : [],
  ]);

  const maxW = Math.max(...likedD.map((s) => s.w));
  const pool = new Map<number, Pooled>();
  const byId = new Map<number, any>();
  const by = new Map<number, { t: string; how: How; c: number; sid: number }[]>();
  const titleOf = new Map(likedD.map((s) => [s.id, { t: s.l.title, how: howOf(s.l) }]));
  const ok = (r: any) => r.poster_path && !own.has(`${type}:${r.id}`) && (r.vote_count ?? 0) >= 15 && !((r.vote_average ?? 0) < 5.5 && (r.vote_count ?? 0) >= 50);
  for (const { sid, w, off, rs } of recs) rs.forEach((r, i) => {
    if (!ok(r)) return;
    const e = pool.get(r.id) ?? { cand: toCand(r), votesFrom: [], explore: false };
    const c = 0.55 * (w / maxW) * posWeight(off + i);
    e.votesFrom.push(c);
    const who = titleOf.get(sid);
    if (who) by.set(r.id, [...(by.get(r.id) ?? []), { ...who, c, sid }]);
    pool.set(r.id, e);
  });
  // Their other work: it carries that person (so the people term fires even before its credits are fetched) and a mild vote.
  const strongest = Math.max(1, ...byPeople.map((x) => x.w));
  for (const { id, w, rs } of byPeople) for (const r of rs) {
    if (!ok(r)) continue;
    const e = pool.get(r.id) ?? { cand: toCand(r), votesFrom: [], explore: false };
    e.cand.people = [...(e.cand.people ?? []), { id, name: personName.get(id) ?? "", k: 0.8 }];
    e.votesFrom.push(0.22 * (w / strongest));
    pool.set(r.id, e); byId.set(r.id, r);
  }
  for (const r of onServices) if (ok(r)) {
    const e = pool.get(r.id) ?? { cand: toCand(r), votesFrom: [], explore: false };
    e.cand.onService = true; pool.set(r.id, e); byId.set(r.id, r);
  }
  for (const r of gems) if (ok(r) && !pool.has(r.id)) pool.set(r.id, { cand: toCand(r), votesFrom: [], explore: false });
  for (const r of wild) if (ok(r) && !pool.has(r.id)) pool.set(r.id, { cand: toCand(r), votesFrom: [], explore: true });

  for (const { rs } of recs) for (const r of rs) if (!byId.has(r.id)) byId.set(r.id, r);
  for (const r of [...gems, ...wild]) if (!byId.has(r.id)) byId.set(r.id, r);
  const gname = new Map(names.map((g) => [g.id, g.name]));
  const withWhy = (id: number): BrowseItem => {
    const e = pool.get(id)!, r = byId.get(id);
    // Genres of this title that you lean towards, strongest first.
    const mine = topGenres(like, 6).filter((g) => e.cand.genres.includes(g)).map((g) => gname.get(g)).filter((x): x is string => !!x);
    const from = [...new Map((by.get(id) ?? []).sort((a, b) => b.c - a.c).map((x) => [x.t, { t: x.t, how: x.how }])).values()];
    const theirs = e.cand.genres.map((g) => gname.get(g)).filter((x): x is string => !!x);
    const people = personMatches(like, e.cand.people).slice(0, 2).map((m) => ({ name: m.person.name || personName.get(m.person.id) || "", titles: personIn.get(m.person.id) ?? [] }));
    return { ...browseItem(type, r), why: whyText({ by: from, genres: e.explore ? theirs : mine, explore: e.explore, imdb: e.cand.imdb, people, onService: e.cand.onService }) };
  };
  for (const [id, xs] of by) { const e = pool.get(id); const top = [...xs].sort((a, b) => b.c - a.c)[0]; if (e && top) e.src = top.sid; }
  const year = new Date().getFullYear();
  // First pass ranks on TMDB's numbers; then IMDb's own score, keywords and cast are fetched for the front of the list and that part is ranked again on them.
  let order = rerank(scorePool([...pool.values()], like, dislike, year));
  {
    const front = order.slice(0, SHORTLIST);
    // IMDb's score and each title's keywords + people, fetched side by side inside one time budget; what has not arrived is simply not used.
    await withBudget(Promise.all([
      hasOmdbKey() ? (async () => {
        const imdbId = new Map<number, string | null>();
        await Promise.all(chunks(front, 3).map(async (ids) => { for (const id of ids) imdbId.set(id, await getTitleImdbId(type, id)); }));
        const got = await getImdbRatings([...imdbId.values()]);
        for (const [id, tt] of imdbId) { const imdb = tt ? got.get(tt) : null; if (imdb) pool.get(id)!.cand.imdb = imdb; }
      })() : null,
      Promise.all(chunks(front, 3).map(async (ids) => {
        for (const id of ids) {
          const d = await detail(type, id).catch(() => null);
          if (!d) continue;
          const x = parseExtras(d, type), c = pool.get(id)!.cand;
          // Keep a person already attached (it came from their filmography); add the billed ones from the credits.
          const have = new Set((c.people ?? []).map((p) => p.id));
          c.kw = x.kw; c.people = [...(c.people ?? []), ...x.people.filter((p) => !have.has(p.id))];
        }
      })),
    ]), 3000);
    const again = rerank(scorePool(front.map((id) => pool.get(id)!), like, dislike, year));
    order = [...again, ...order.slice(SHORTLIST)];
  }
  const poolPages = Math.ceil(order.length / PAGE);
  if (page <= poolPages) return { items: order.slice((page - 1) * PAGE, page * PAGE).map((id) => withWhy(id)), more: true };

  // Past the pool: popular titles in the genres you lean towards.
  const p: Record<string, string> = { sort_by: "popularity.desc", include_adult: "false", "vote_count.gte": "100", page: String(page - poolPages), [`${date}.lte`]: new Date().toISOString().slice(0, 10) };
  if (lean.length) p.with_genres = lean.join("|");
  const d = await tmdb(`/discover/${type}`, p, 3600);
  const items = ((d.results ?? []) as any[]).filter((r) => r.poster_path && !own.has(`${type}:${r.id}`) && !pool.has(r.id)).map((r) => browseItem(type, r));
  return { items, more: page - poolPages < Math.min(d.total_pages ?? 1, 200) };
}
