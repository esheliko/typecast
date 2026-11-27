import { browse, browseItem, genreList, tmdb } from "./tmdb";
import { buildProfile, extraParam, howOf, parseExtras, personMatches, seedWeight, topGenres, type Cand, type Profile } from "./foryou-rank";
import { decayByFranchise } from "./franchise";
import { createTtlMemo } from "./ttl-memo";
import { interleave } from "./browse";
import { buildEntry, dayOf, type UpEntry } from "./upcoming";
import { tzOf } from "./today";
import { MIN_PICK, PICK_HORIZON, isPickable, rankUpcoming, upWhy, upWhyShort, type UpCand } from "./upcoming-rank";
import type { BrowseItem, BrowseType, LibItem, MediaType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DAY = 24 * 3600, WEEK = 7 * DAY;
const SEEDS = 12;
const PAGE = 20;

/** An upcoming pick: a Browse card plus its release day and a short reason for the Library row. */
export interface UpPick extends BrowseItem { due: string; short: string; score: number }

const yearOf = (r: any) => +String(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || 0;
const dateOf = (r: any) => String(r.release_date ?? r.first_air_date ?? "").slice(0, 10);
const toCand = (r: any): Cand => ({ id: r.id, genres: r.genre_ids ?? (r.genres ?? []).map((g: any) => g.id), lang: r.original_language ?? "", year: yearOf(r), avg: r.vote_average ?? 0, votes: r.vote_count ?? 0, pop: r.popularity ?? 0 });
/** Same request as For you's (one shared TMDB cache entry per title). */
const detail = (type: MediaType, id: number) => tmdb(`/${type}/${id}`, { append_to_response: extraParam(type) }, WEEK);
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** One user's picks per kind, kept a few minutes so Browse pages and the Library share one ranking. */
const memo = createTtlMemo<Promise<UpPick[]>>(10 * 60_000, 60);

/**
 * Unreleased films (or new series) not in your library that fit your taste, best first. Fails soft: a source that errors adds nothing.
 * Sources: titles due in the genres you lean towards (two pages), the coming work of the people you like most, the next parts of
 * film sagas you liked, and the most anticipated releases overall. Everything is cached by TMDB's fetch cache (a day or more).
 */
export function upcomingPicks(type: MediaType, lib: LibItem[], country = "", memoOwner?: string, now = Date.now()): Promise<UpPick[]> {
  const k = memoOwner ? `${memoOwner}:${type}:${lib.length}:${lib.reduce((a, l) => Math.max(a, l.updated), 0)}` : null;
  const hit = k ? memo.get(k) : undefined;
  if (hit) return hit;
  const p = build(type, lib, dayOf(now, tzOf(country)), now);
  if (k) { memo.set(k, p); p.catch(() => { if (memo.get(k) === p) memo.delete(k); }); }
  return p;
}

async function build(type: MediaType, lib: LibItem[], today: string, now: number): Promise<UpPick[]> {
  const mine = lib.filter((l) => l.type === type).map((l) => ({ l, w: seedWeight(l, now) }));
  const liked = mine.filter((x) => x.w > 0).sort((a, b) => b.w - a.w).slice(0, SEEDS);
  const disliked = mine.filter((x) => x.w < 0).sort((a, b) => a.w - b.w).slice(0, 4);
  if (!liked.length) return [];
  const describe = async (x: { l: LibItem; w: number }) => { const d = await detail(x.l.type, x.l.id).catch(() => null); return { ...x, cand: d ? { ...toCand(d), ...parseExtras(d, type) } : null }; };
  const [likedRaw, dislikedD] = await Promise.all([Promise.all(liked.map(describe)), Promise.all(disliked.map(describe))]);
  const d = decayByFranchise(likedRaw, (x) => x.w, (x) => x.cand?.collection);
  const likedD = likedRaw.map((x, i) => ({ ...x, w: d[i] }));
  const like: Profile = buildProfile(likedD), dislike: Profile = buildProfile(dislikedD, -1);

  const own = new Set(lib.map((l) => l.key));
  const until = addDays(today, PICK_HORIZON);
  const dk = type === "movie" ? "primary_release_date" : "first_air_date";
  const soon = { include_adult: "false", sort_by: "popularity.desc", [`${dk}.gte`]: addDays(today, 1), [`${dk}.lte`]: until };
  const lean = topGenres(like, 3);
  const personName = new Map<number, string>(), personIn = new Map<number, string[]>();
  for (const s of [...likedD].sort((a, b) => b.w - a.w)) for (const x of s.cand?.people ?? []) {
    personName.set(x.id, x.name); personIn.set(x.id, [...(personIn.get(x.id) ?? []), s.l.title]);
  }
  const favPeople = [...like.person.entries()].filter(([, w]) => w >= 1.2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  const sagas = new Map<number, LibItem>();
  for (const s of [...likedD].sort((a, b) => b.w - a.w)) { const c = s.cand?.collection; if (c != null && !sagas.has(c)) sagas.set(c, s.l); }
  const list = (path: string, params: Record<string, string>, ttl = DAY) => tmdb(path, params, ttl).then((r) => (r.results ?? []) as any[]).catch(() => [] as any[]);

  const [names, inGenres, inGenres2, anticipated, byPeople, bySaga] = await Promise.all([
    genreList(type).catch(() => []),
    lean.length ? list(`/discover/${type}`, { ...soon, with_genres: lean.join("|") }) : [],
    lean.length ? list(`/discover/${type}`, { ...soon, with_genres: lean.join("|"), page: "2" }) : [],
    list(`/discover/${type}`, soon),
    Promise.all(favPeople.map((id) => tmdb(`/person/${id}/combined_credits`, {}, DAY).then((r) => ({
      id, rs: [...((r.cast ?? []) as any[]).filter((c) => (c.order ?? 99) < 8), ...((r.crew ?? []) as any[]).filter((c) => c.job === "Director" || c.job === "Creator")].filter((c) => c.media_type === type),
    })).catch(() => ({ id, rs: [] as any[] })))),
    type === "movie" ? Promise.all([...sagas].slice(0, 6).map(([cid, l]) => tmdb(`/collection/${cid}`, {}, DAY).then((r) => ({ l, rs: (r.parts ?? []) as any[] })).catch(() => ({ l, rs: [] as any[] })))) : [],
  ]);

  const pool = new Map<number, UpCand>(), raw = new Map<number, any>();
  const add = (r: any) => {
    if (!r?.id || !r.poster_path || !isPickable({ date: dateOf(r) }, `${type}:${r.id}`, own, today)) return null;
    let c = pool.get(r.id);
    if (!c) { c = { ...toCand(r), date: dateOf(r) }; pool.set(r.id, c); raw.set(r.id, r); }
    return c;
  };
  for (const r of [...inGenres, ...inGenres2, ...anticipated]) add(r);
  for (const { id, rs } of byPeople) for (const r of rs) {
    const c = add(r);
    if (c && !(c.people ?? []).some((p) => p.id === id)) c.people = [...(c.people ?? []), { id, name: personName.get(id) ?? r.name ?? "", k: r.job || (r.order ?? 9) < 3 ? 1 : 0.6 }];
  }
  for (const { l, rs } of bySaga) for (const r of rs) { const c = add(r); if (c) c.saga = { t: l.title, how: howOf(l) }; }

  // Titles only seen in a list have no themes or billed cast yet: fetch them for the best-looking part of the pool (cached a week).
  const first = rankUpcoming([...pool.values()], like, dislike).slice(0, 30);
  await Promise.all(first.map(async ({ c }) => {
    const x = await detail(type, c.id).then((d) => parseExtras(d, type)).catch(() => null);
    if (!x) return;
    const have = new Set((c.people ?? []).map((p) => p.id));
    c.kw = x.kw; c.people = [...(c.people ?? []), ...x.people.filter((p) => !have.has(p.id))];
  }));
  const gname = new Map(names.map((g) => [g.id, g.name]));
  return rankUpcoming([...pool.values()], like, dislike).map(({ c, score }) => {
    const genres = topGenres(like, 6).filter((g) => c.genres.includes(g)).map((g) => gname.get(g)).filter((x): x is string => !!x);
    const people = personMatches(like, c.people).slice(0, 2).map((m) => ({ name: m.person.name || personName.get(m.person.id) || "", titles: personIn.get(m.person.id) ?? [] }));
    const o = { saga: c.saga, people, genres };
    return { ...browseItem(type, raw.get(c.id)), rating: 0, why: upWhy(o), due: c.date, short: upWhyShort(o), score };
  });
}

/** One page of the Browse "Upcoming" list. With nothing to learn from, it shows the most anticipated releases instead. */
export async function upcomingPage(type: BrowseType, page: number, lib: LibItem[], country: string, memoOwner?: string): Promise<{ items: BrowseItem[]; more: boolean; notice?: string }> {
  if (type === "all") {
    const [m, t] = await Promise.all([upcomingPage("movie", page, lib, country, memoOwner), upcomingPage("tv", page, lib, country, memoOwner)]);
    // One kind with nothing to learn from just adds nothing; the note is only for when neither has picks.
    if (m.notice && t.notice) return { items: interleave(m.items, t.items), more: m.more || t.more, notice: m.notice };
    return { items: interleave(m.notice ? [] : m.items, t.notice ? [] : t.items), more: (!m.notice && m.more) || (!t.notice && t.more) };
  }
  const all = await upcomingPicks(type, lib, country, memoOwner);
  if (!all.length) {
    // Nothing to learn from yet: the most anticipated releases, with a note.
    const r = await browse("soon", type, page);
    return { items: r.items, more: r.more, notice: "Mark a few titles you have watched or want to watch and this list shows what is coming that fits your taste. Showing the most anticipated for now." };
  }
  return { items: all.slice((page - 1) * PAGE, page * PAGE), more: page * PAGE < all.length };
}

/** The few best picks across films and series, for the Library's Upcoming section. Never throws. */
export async function libraryPicks(lib: LibItem[], country: string, memoOwner?: string, n = 6): Promise<UpPick[]> {
  const [m, t] = await Promise.all([upcomingPicks("movie", lib, country, memoOwner).catch(() => []), upcomingPicks("tv", lib, country, memoOwner).catch(() => [])]);
  return [...m, ...t].filter((p) => p.score >= MIN_PICK).sort((a, b) => b.score - a.score).slice(0, n);
}

/** An Upcoming row for a pick ("Premiere" for a new series), with its short reason. Null when its date no longer qualifies. */
export function pickEntry(p: UpPick, today: string): (UpEntry & { why: string }) | null {
  const l = { key: p.key, type: p.type, id: p.id, title: p.title, year: p.year, poster: p.poster, status: "watchlist", priority: "someday" } as LibItem;
  const e = buildEntry(l, { date: p.due, ...(p.type === "tv" ? { s: 1, e: 1 } : {}) }, today);
  return e ? { ...e, why: p.short } : null;
}
