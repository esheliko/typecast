import { browse, browseItem, genreList, tmdb } from "./tmdb";
import { buildProfile, extraParam, howOf, parseExtras, seedWeight, topGenres, type Cand, type Profile } from "./foryou-rank";
import { decayByFranchise } from "./franchise";
import { createTtlMemo } from "./ttl-memo";
import { interleave } from "./browse";
import { buildEntry, dayOf, type UpEntry } from "./upcoming";
import { tzOf } from "./today";
import { PICK_HORIZON, creditsOf, followedPeople, isConnected, isPickable, rankUpcoming, upWhy, upWhyShort, type Followed, type Role, type Saga, type UpCand } from "./upcoming-rank";
import type { BrowseItem, BrowseType, LibItem, MediaType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DAY = 24 * 3600, WEEK = 7 * DAY;
const SEEDS = 12;
const PAGE = 20;

/** An upcoming pick: a Browse card plus its release day and a short reason for the Library row. */
/** `connected`: a franchise you watched or people you follow are behind it. */
export interface UpPick extends BrowseItem { due: string; short: string; score: number; connected: boolean }

const yearOf = (r: any) => +String(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || 0;
const dateOf = (r: any) => String(r.release_date ?? r.first_air_date ?? "").slice(0, 10);
const toCand = (r: any): Cand => ({ id: r.id, genres: r.genre_ids ?? (r.genres ?? []).map((g: any) => g.id), lang: r.original_language ?? "", year: yearOf(r), avg: r.vote_average ?? 0, votes: r.vote_count ?? 0, pop: r.popularity ?? 0 });
/** Same request as For you's (one shared TMDB cache entry per title). */
const detail = (type: MediaType, id: number) => tmdb(`/${type}/${id}`, { append_to_response: extraParam(type) }, WEEK);
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** One user's picks per kind, kept a few minutes so Browse pages and the Library share one ranking. */
const memo = createTtlMemo<Promise<UpPick[]>>(10 * 60_000, 60);
/** One user's connections (people followed, franchises watched), shared by both kinds. */
const connMemo = createTtlMemo<Promise<Conn>>(10 * 60_000, 30);
/** Most library titles described for connections (each one TMDB detail call, cached a week and shared with For you). */
const DESCRIBE = 80;

type Desc = { l: LibItem; w: number; d: any | null };
interface Conn {
  descs: Desc[];
  people: Followed[];
  /** What each followed person has coming (their TMDB combined credits, unfiltered). */
  credits: { f: Followed; cast: any[]; crew: any[] }[];
  /** Franchises you watched, with all their parts. */
  sagas: { saga: Saga; parts: any[] }[];
}

/** Runs `fn` over `xs`, `n` at a time. */
async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]); } }));
  return out;
}

/**
 * Who and what you follow, across films AND series (an actor from your films may star in a new series): every title you watched,
 * are watching or want (strongest first, at most DESCRIBE) gives its director/creator and top cast; the people in several of them
 * (or behind one you loved) are followed. Every film franchise (TMDB collection) you watched a part of is followed.
 */
async function connections(lib: LibItem[], now: number): Promise<Conn> {
  const mine = lib.map((l) => ({ l, w: seedWeight(l, now) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w).slice(0, DESCRIBE);
  const descs: Desc[] = await pool(mine, 12, async (x) => ({ ...x, d: await detail(x.l.type, x.l.id).catch(() => null) }));
  const people = followedPeople(descs.map((x) => ({ title: x.l.title, w: x.w, people: x.d ? creditsOf(x.d, x.l.type) : [] })));
  const byCol = new Map<number, { name: string; best: Desc; w: number }>();
  for (const x of descs) {
    const c = x.l.type === "movie" ? x.d?.belongs_to_collection : null;
    if (typeof c?.id !== "number") continue;
    const e = byCol.get(c.id);
    // The franchise is named by your most recent part of it ("after Dune: Part Two").
    if (!e) byCol.set(c.id, { name: String(c.name ?? "").replace(/ Collection$/, ""), best: x, w: x.w });
    else { e.w += x.w; if (Number(x.l.year) > Number(e.best.l.year)) e.best = x; }
  }
  const [credits, sagas] = await Promise.all([
    Promise.all(people.map((f) => tmdb(`/person/${f.id}/combined_credits`, {}, DAY).then((r) => ({ f, cast: (r.cast ?? []) as any[], crew: (r.crew ?? []) as any[] })).catch(() => ({ f, cast: [] as any[], crew: [] as any[] })))),
    Promise.all([...byCol].sort((a, b) => b[1].w - a[1].w).slice(0, 12).map(([id, e]) => tmdb(`/collection/${id}`, {}, DAY)
      .then((r) => ({ saga: { name: e.name || e.best.l.title, t: e.best.l.title, how: howOf(e.best.l) }, parts: (r.parts ?? []) as any[] }))
      .catch(() => ({ saga: { name: e.name || e.best.l.title, t: e.best.l.title, how: howOf(e.best.l) }, parts: [] as any[] })))),
  ]);
  return { descs, people, credits, sagas };
}
function connectionsFor(lib: LibItem[], memoOwner: string | undefined, now: number): Promise<Conn> {
  const k = memoOwner ? `${memoOwner}:${lib.length}:${lib.reduce((a, l) => Math.max(a, l.updated), 0)}` : null;
  const hit = k ? connMemo.get(k) : undefined;
  if (hit) return hit;
  const p = connections(lib, now);
  if (k) { connMemo.set(k, p); p.catch(() => { if (connMemo.get(k) === p) connMemo.delete(k); }); }
  return p;
}

/**
 * Unreleased films (or new series) not in your library, best first: first those with a connection to what you watched (next part
 * of a franchise, new work by people you follow), then the ones that only fit your taste (genres you lean towards, most anticipated).
 * Fails soft: a source that errors adds nothing. Everything is cached by TMDB's fetch cache (a day or more).
 */
export function upcomingPicks(type: MediaType, lib: LibItem[], country = "", memoOwner?: string, now = Date.now()): Promise<UpPick[]> {
  const k = memoOwner ? `${memoOwner}:${type}:${lib.length}:${lib.reduce((a, l) => Math.max(a, l.updated), 0)}` : null;
  const hit = k ? memo.get(k) : undefined;
  if (hit) return hit;
  const p = build(type, lib, dayOf(now, tzOf(country)), connectionsFor(lib, memoOwner, now), now);
  if (k) { memo.set(k, p); p.catch(() => { if (memo.get(k) === p) memo.delete(k); }); }
  return p;
}

async function build(type: MediaType, lib: LibItem[], today: string, connP: Promise<Conn>, now: number): Promise<UpPick[]> {
  const conn = await connP;
  const toSeed = (x: Desc) => ({ ...x, cand: x.d ? { ...toCand(x.d), ...parseExtras(x.d, type) } : null });
  const liked = conn.descs.filter((x) => x.l.type === type).slice(0, SEEDS).map(toSeed);
  const disliked = lib.filter((l) => l.type === type).map((l) => ({ l, w: seedWeight(l, now) })).filter((x) => x.w < 0).sort((a, b) => a.w - b.w).slice(0, 4);
  if (!conn.descs.length) return [];
  const dislikedD = await Promise.all(disliked.map(async (x) => toSeed({ ...x, d: await detail(type, x.l.id).catch(() => null) })));
  const d = decayByFranchise(liked, (x) => x.w, (x) => x.cand?.collection);
  const like: Profile = buildProfile(liked.map((x, i) => ({ ...x, w: d[i] }))), dislike: Profile = buildProfile(dislikedD, -1);

  const own = new Set(lib.map((l) => l.key));
  const until = addDays(today, PICK_HORIZON);
  const dk = type === "movie" ? "primary_release_date" : "first_air_date";
  const soon = { include_adult: "false", sort_by: "popularity.desc", [`${dk}.gte`]: addDays(today, 1), [`${dk}.lte`]: until };
  const lean = topGenres(like, 3);
  const list = (path: string, params: Record<string, string>, ttl = DAY) => tmdb(path, params, ttl).then((r) => (r.results ?? []) as any[]).catch(() => [] as any[]);
  const [names, inGenres, inGenres2, anticipated] = await Promise.all([
    genreList(type).catch(() => []),
    lean.length ? list(`/discover/${type}`, { ...soon, with_genres: lean.join("|") }) : [],
    lean.length ? list(`/discover/${type}`, { ...soon, with_genres: lean.join("|"), page: "2" }) : [],
    list(`/discover/${type}`, soon),
  ]);

  const pool_ = new Map<number, UpCand>(), raw = new Map<number, any>();
  const add = (r: any) => {
    if (!r?.id || !r.poster_path || !isPickable({ date: dateOf(r) }, `${type}:${r.id}`, own, today)) return null;
    let c = pool_.get(r.id);
    if (!c) { c = { ...toCand(r), date: dateOf(r) }; pool_.set(r.id, c); raw.set(r.id, r); }
    return c;
  };
  for (const { saga, parts } of type === "movie" ? conn.sagas : []) for (const r of parts) { const c = add(r); if (c) c.saga = saga; }
  for (const { f, cast, crew } of conn.credits) {
    // Their role on THIS title: directing / creating it, or a real part in it (not a cameo far down the bill).
    const made = crew.filter((r) => r.media_type === type && (r.job === "Director" || r.job === "Creator")).map((r) => ({ r, role: (type === "movie" ? "director" : "creator") as Role }));
    const acts = cast.filter((r) => r.media_type === type && (r.order == null || r.order < 10)).map((r) => ({ r, role: "actor" as Role }));
    for (const { r, role } of [...made, ...acts]) {
      const c = add(r);
      if (!c) continue;
      const via = c.via ?? (c.via = []);
      const had = via.find((x) => x.id === f.id);
      if (!had) via.push({ ...f, role }); else if (role !== "actor") had.role = role;
    }
  }
  for (const r of [...inGenres, ...inGenres2, ...anticipated]) add(r);

  // Titles only seen in a list have no themes yet: fetch them for the best-looking part of the pool (cached a week).
  const first = rankUpcoming([...pool_.values()], like, dislike).slice(0, 30);
  await Promise.all(first.map(async ({ c }) => {
    const x = await detail(type, c.id).then((dd) => parseExtras(dd, type)).catch(() => null);
    if (x) c.kw = x.kw;
  }));
  const gname = new Map(names.map((g) => [g.id, g.name]));
  return rankUpcoming([...pool_.values()], like, dislike).map(({ c, score }) => {
    const genres = topGenres(like, 6).filter((g) => c.genres.includes(g)).map((g) => gname.get(g)).filter((x): x is string => !!x);
    return { ...browseItem(type, raw.get(c.id)), rating: 0, why: upWhy(c, genres), due: c.date, short: upWhyShort(c, genres), score, connected: isConnected(c) };
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
export async function libraryPicks(lib: LibItem[], country: string, memoOwner?: string, n = 8): Promise<UpPick[]> {
  const [m, t] = await Promise.all([upcomingPicks("movie", lib, country, memoOwner).catch(() => []), upcomingPicks("tv", lib, country, memoOwner).catch(() => [])]);
  // Only picks with a connection (a franchise you watched, people you follow): the Library is not the place for genre guesses.
  return [...m, ...t].filter((p) => p.connected).sort((a, b) => b.score - a.score).slice(0, n);
}

/** An Upcoming row for a pick ("Premiere" for a new series), with its short reason. Null when its date no longer qualifies. */
export function pickEntry(p: UpPick, today: string): (UpEntry & { why: string }) | null {
  const l = { key: p.key, type: p.type, id: p.id, title: p.title, year: p.year, poster: p.poster, status: "watchlist", priority: "someday" } as LibItem;
  const e = buildEntry(l, { date: p.due, ...(p.type === "tv" ? { s: 1, e: 1 } : {}) }, today);
  return e ? { ...e, why: p.short } : null;
}
