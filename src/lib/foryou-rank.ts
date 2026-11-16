/**
 * Pure ranking for Browse > For you (no network, unit tested). foryou.ts fetches; this decides.
 *
 * Ideas used, scaled to a personal library (tens to hundreds of titles, no other users):
 * - Seeds are weighted by how much you liked them (rating centred on 3, not just "watched"), faded gently with age.
 * - Item-based collaborative signal: TMDB's "recommendations" of each seed, position-weighted, combined with a
 *   noisy-or so ten weak votes never beat three strong ones and nothing grows without bound.
 * - Content signal: a taste profile (genres, decades, original language) built from the seeds, matched to each candidate;
 *   a "dislike" profile from low-rated titles pushes similar candidates down.
 * - People signal: the top-billed cast and the director / creator of titles you liked (weighted like the seeds). A
 *   candidate with someone you keep coming back to is boosted, and the best of their other work is added as candidates.
 * - Themes: TMDB keywords of the seeds ("heist", "time loop") matched against each candidate, beyond what genres say.
 * - Quality prior: Bayesian average (IMDb-style) so a 9.0 from 12 votes does not outrank an 8.1 from 20,000.
 * - Diversity: greedy maximal-marginal-relevance re-rank, so one franchise or one genre does not fill a screen.
 * - Exploration: every few slots go to a well-rated title outside your usual genres.
 */
import type { LibItem, MediaType } from "./types";

const DAY = 24 * 3600 * 1000;

/** What we know about a title in TMDB's list results (and, for seeds, its detail record). */
export interface Cand {
  id: number; genres: number[]; lang: string; year: number; avg: number; votes: number; pop: number;
  /** IMDb's own score, when known (OMDb). Used instead of TMDB's vote average for quality. */
  imdb?: { rating: number; votes: number };
  /** TMDB keyword ids and the people attached to the title (`k`: 1 = director or lead, less for lower billing). Unknown until fetched. */
  kw?: number[]; people?: Person[];
  /** Streams on one of your services (only set for candidates that came from that lookup). */
  onService?: boolean;
}
export interface Person { id: number; name: string; k: number }

const BILLED = 6;
/* eslint-disable @typescript-eslint/no-explicit-any */
/** Pulls keywords and people out of a TMDB detail record fetched with `extraParam`. Pure. */
export function parseExtras(d: any, type: MediaType): { kw: number[]; people: Person[] } {
  const kws: any[] = (type === "movie" ? d?.keywords?.keywords : d?.keywords?.results) ?? [];
  const kw = kws.map((x) => x.id).filter((x) => Number.isFinite(x)).slice(0, 40) as number[];
  const cast: any[] = (type === "movie" ? d?.credits?.cast : d?.aggregate_credits?.cast) ?? [];
  const people: Person[] = [];
  const seen = new Set<number>();
  const add = (id: unknown, name: unknown, k: number) => { if (typeof id !== "number" || seen.has(id)) return; seen.add(id); people.push({ id, name: String(name ?? ""), k }); };
  // Directors (films) and creators (series) shape a title more than any single actor.
  if (type === "movie") { for (const c of (d?.credits?.crew ?? []) as any[]) if (c.job === "Director") add(c.id, c.name, 1); }
  else for (const c of (d?.created_by ?? []) as any[]) add(c.id, c.name, 1);
  for (const c of [...cast].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, BILLED)) add(c.id, c.name, 1 / (1 + (c.order ?? BILLED) / 3));
  return { kw, people };
}
/** `append_to_response` value that makes one TMDB detail call carry everything `parseExtras` reads. */
export const extraParam = (type: MediaType) => (type === "movie" ? "credits,keywords" : "aggregate_credits,keywords");
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface Seed { key: string; id: number; w: number; cand: Cand | null }

/** How strongly a library entry says "more like this" (> 0) or "less like this" (< 0). 0 = no opinion. */
export function seedWeight(l: LibItem, now: number): number {
  let w: number;
  // Wanting to see something is a weaker taste signal than having watched it.
  if (l.status === "watchlist") w = l.priority === "must" ? 1.0 : 0.4;
  else if (l.rating >= 5) w = 3.2;
  else if (l.rating >= 4) w = 2.4;
  else if (l.rating === 3) w = 1.2;
  else if (l.rating > 0) w = l.rating === 2 ? -0.8 : -1.6;
  else w = l.status === "watching" || l.status === "partial" ? 1.3 : 1.5; // watched, never rated: mildly positive
  if (w <= 0) return w;
  // Only part of it was seen: a weaker sign of taste than finishing it or being in the middle of it.
  if (l.status === "partial") w *= 0.6;
  // Taste drifts: a title from years ago counts for at least half.
  const age = Math.max(0, now - (l.watchedAt ?? l.updated ?? l.added ?? now)) / DAY;
  return w * (0.5 + 0.5 * 2 ** (-age / 730));
}

/** Weighted sampling without replacement (Efraimidis-Spirakis). Top `anchors` always stay, so the list is recognisably yours. */
export function sampleSeeds<T extends { w: number }>(items: T[], n: number, anchors: number, rand: () => number): T[] {
  const sorted = items.filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  const fixed = sorted.slice(0, anchors);
  const rest = sorted.slice(anchors).map((x) => ({ x, k: Math.log(Math.max(rand(), 1e-12)) / x.w })).sort((a, b) => b.k - a.k);
  return [...fixed, ...rest.slice(0, Math.max(0, n - fixed.length)).map((r) => r.x)];
}

export interface Profile {
  genre: Map<number, number>; decade: Map<number, number>; lang: Map<string, number>; total: number;
  /** Keyword id -> weight, and person id -> weight (seed weight x billing), built from the seeds' extras. */
  kw: Map<number, number>; person: Map<number, number>;
}
const bump = <K,>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);

export function buildProfile(seeds: { w: number; cand: Cand | null }[], sign: 1 | -1 = 1): Profile {
  const p: Profile = { genre: new Map(), decade: new Map(), lang: new Map(), total: 0, kw: new Map(), person: new Map() };
  for (const s of seeds) {
    const w = Math.abs(s.w);
    if (!s.cand || (sign === 1 ? s.w <= 0 : s.w >= 0)) continue;
    p.total += w;
    for (const g of s.cand.genres) bump(p.genre, g, w / Math.sqrt(s.cand.genres.length));
    if (s.cand.year) { bump(p.decade, Math.floor(s.cand.year / 10), w); }
    if (s.cand.lang) bump(p.lang, s.cand.lang, w);
    for (const k of s.cand.kw ?? []) bump(p.kw, k, w);
    for (const x of s.cand.people ?? []) bump(p.person, x.id, w * x.k);
  }
  return p;
}

/** 0..1: how well a candidate's genres line up with a profile (cosine-like, so many-genre titles are not favoured). */
export function genreFit(p: Profile, genres: number[]): number {
  if (!p.total || !genres.length) return 0;
  let dot = 0, norm = 0;
  for (const v of p.genre.values()) norm += v * v;
  for (const g of genres) dot += p.genre.get(g) ?? 0;
  return norm ? Math.min(1, dot / (Math.sqrt(norm) * Math.sqrt(genres.length))) : 0;
}

/** 0..1: how much a candidate's keywords overlap your themes. Sparse vectors give small cosines, so it is scaled up and capped. */
export function kwFit(p: Profile, kw: number[]): number {
  if (!p.kw.size || !kw.length) return 0;
  let dot = 0, norm = 0;
  for (const v of p.kw.values()) norm += v * v;
  for (const k of kw) dot += p.kw.get(k) ?? 0;
  return norm ? Math.min(1, (3 * dot) / (Math.sqrt(norm) * Math.sqrt(kw.length))) : 0;
}

/** A person with this much weight (about two rated-5 titles as lead) counts as fully "someone you like". */
const PERSON_FULL = 6.4;
/** The people on a candidate that you have a taste for, strongest first, with how strong (0..0.9). */
export function personMatches(p: Profile, people: Person[] | undefined): { person: Person; s: number }[] {
  if (!people?.length || !p.person.size) return [];
  return people.map((x) => ({ person: x, s: Math.min(0.9, ((p.person.get(x.id) ?? 0) / PERSON_FULL) * (0.5 + 0.5 * x.k)) }))
    .filter((m) => m.s > 0.05).sort((a, b) => b.s - a.s);
}
/** 0..1: noisy-or over the matching people, so two favourites in one title beat one, and nothing exceeds 1. */
export function peopleFit(p: Profile, people: Person[] | undefined): number {
  return 1 - personMatches(p, people).reduce((acc, m) => acc * (1 - m.s), 1);
}

/** 0..1: share of your taste that sits in this decade or the ones next to it. */
export function decadeFit(p: Profile, year: number): number {
  if (!p.total || !year) return 0.3;
  const d = Math.floor(year / 10);
  const at = (x: number) => (p.decade.get(x) ?? 0) / p.total;
  return Math.min(1, at(d) + 0.4 * (at(d - 1) + at(d + 1)));
}

export const langFit = (p: Profile, lang: string) => (p.total && lang ? Math.min(1, (p.lang.get(lang) ?? 0) / p.total) : 0);

/** IMDb-style weighted rating, scaled to 0..1. m = votes needed before the title's own average counts as much as the prior. */
export function quality(avg: number, votes: number, prior = 6.4, m = 300): number {
  const b = (votes / (votes + m)) * avg + (m / (votes + m)) * prior;
  return Math.max(0, Math.min(1, (b - 5) / 3.5));
}

/** Position in a seed's recommendation list: TMDB lists the closest matches first. */
export const posWeight = (pos: number) => 1 / (1 + pos / 12);

/** `src`: the seed that recommends it most, so one seed's neighbours (a franchise) do not fill a screen. */
export interface Pooled { cand: Cand; votesFrom: number[]; explore: boolean; src?: number }

export interface Scored { src?: number; id: number; score: number; genres: number[]; explore: boolean; parts: { cf: number; content: number; q: number; neg: number; people: number } }

/** Score every candidate. Weights sum to about 1 so the number means something. */
export function scorePool(pool: Pooled[], like: Profile, dislike: Profile, year: number): Scored[] {
  return pool.map((p) => {
    const c = p.cand;
    const cf = 1 - p.votesFrom.reduce((acc, v) => acc * (1 - Math.min(0.9, v)), 1); // noisy-or
    // Themes (keywords) only count once a candidate's keywords are known; until then the older genre-heavy blend is used, so unknowns are not punished.
    const content = c.kw
      ? 0.5 * genreFit(like, c.genres) + 0.25 * kwFit(like, c.kw) + 0.15 * decadeFit(like, c.year) + 0.1 * langFit(like, c.lang)
      : 0.6 * genreFit(like, c.genres) + 0.25 * decadeFit(like, c.year) + 0.15 * langFit(like, c.lang);
    const people = peopleFit(like, c.people);
    // IMDb's score when we have it (its vote counts are bigger, so the prior needs more weight); TMDB's only as a fallback for ranking, never shown.
    const q = c.imdb ? quality(c.imdb.rating, c.imdb.votes, 6.6, 1000) : quality(c.avg, c.votes);
    const dislikeFit = c.kw ? 0.65 * genreFit(dislike, c.genres) + 0.35 * kwFit(dislike, c.kw) : genreFit(dislike, c.genres);
    const neg = dislike.total ? dislikeFit * Math.min(1, dislike.total / (like.total || 1) + 0.3) : 0;
    // Very new titles have few votes: do not punish, nudge. Mega-popular ones are already everywhere: tiny haircut.
    const fresh = c.year >= year - 2 ? 0.04 : 0;
    const crowd = c.pop > 150 ? -0.03 : 0;
    const avail = c.onService ? 0.04 : 0;
    const score = 0.38 * cf + 0.24 * content + 0.24 * q + 0.14 * people + fresh + crowd + avail - 0.2 * neg;
    return { src: p.src, id: c.id, score, genres: c.genres, explore: p.explore, parts: { cf, content, q, neg, people } };
  });
}

const jaccard = (a: number[], b: number[]) => {
  if (!a.length || !b.length) return 0;
  const s = new Set(a); let i = 0;
  for (const x of b) if (s.has(x)) i++;
  return i / (a.length + b.length - i);
};

/**
 * Greedy maximal-marginal-relevance: each pick trades its score against how much it repeats what is already chosen.
 * Every `every`-th slot goes to the best exploration candidate instead (a well-rated title outside your usual lane).
 */
export function rerank(scored: Scored[], opts: { lambda?: number; every?: number; limit?: number } = {}): number[] {
  const lambda = opts.lambda ?? 0.25, every = opts.every ?? 6;
  const main = scored.filter((s) => !s.explore).sort((a, b) => b.score - a.score);
  const explore = scored.filter((s) => s.explore).sort((a, b) => b.score - a.score);
  const limit = Math.min(opts.limit ?? 400, main.length + explore.length);
  const out: Scored[] = [];
  const window = 8; // only the last few picks count as "just shown"
  const take = (arr: Scored[]) => {
    const head = arr.slice(0, 60);
    const recent = out.slice(-window);
    let best = -1, bestV = -Infinity;
    head.forEach((s, i) => {
      const sim = recent.reduce((m, r) => Math.max(m, jaccard(s.genres, r.genres)), 0);
      const same = s.src != null ? recent.filter((r) => r.src === s.src).length : 0;
      const v = s.score - lambda * sim - 0.07 * same;
      if (v > bestV) { bestV = v; best = i; }
    });
    return best < 0 ? undefined : arr.splice(best, 1)[0];
  };
  while (out.length < limit) {
    const slot = out.length + 1;
    const pick = (slot % every === 0 && explore.length ? take(explore) : undefined) ?? take(main) ?? take(explore);
    if (!pick) break;
    out.push(pick);
  }
  return out.map((s) => s.id);
}

/** Genres you lean towards, strongest first. */
export function topGenres(p: Profile, n: number): number[] {
  return [...p.genre.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}

export const mediaKey = (type: MediaType, id: number) => `${type}:${id}`;

const votesText = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** How a library title relates to you, for the reason text: it decides the wording, so "to watch" is never called "liked". */
export type How = "loved" | "watched" | "watching" | "partial" | "must" | "want";
export function howOf(l: Pick<LibItem, "status" | "rating" | "priority">): How {
  if (l.status === "watchlist") return l.priority === "must" ? "must" : "want";
  if (l.rating >= 4) return "loved";
  return l.status === "watched" ? "watched" : l.status === "partial" ? "partial" : "watching";
}
const PHRASE: Record<How, (t: string) => string> = {
  loved: (t) => `you rated ${t} highly`, watched: (t) => `you watched ${t}`, watching: (t) => `you are watching ${t}`, partial: (t) => `you watched part of ${t}`,
  must: (t) => `${t} is on your must-watch list`, want: (t) => `${t} is on your to-watch list`,
};

/** The one-line reason a For you title is shown (hover text). `by`: the library titles that recommend it, strongest first. Only IMDb's score is quoted. */
export function whyText(o: { by: { t: string; how: How }[]; genres: string[]; explore: boolean; imdb?: { rating: number; votes: number }; people?: { name: string; titles: string[] }[]; onService?: boolean }): string {
  const rate = o.imdb ? `IMDb ${o.imdb.rating.toFixed(1)}${o.imdb.votes ? ` (${votesText(o.imdb.votes)} votes)` : ""}` : "";
  const g = list(o.genres.slice(0, 2));
  const who = (o.people ?? []).filter((x) => x.name).slice(0, 2);
  // One title that all of them were in reads as a group; otherwise each gets their own.
  const shared = who.length ? who[0].titles.find((t) => who.every((x) => x.titles.includes(t))) : undefined;
  const cast = !who.length ? ""
    : shared ? `Features ${list(who.map((x) => x.name))}, who you liked in ${shared}`
    : `Features ${list(who.map((x) => (x.titles[0] ? `${x.name} (you liked them in ${x.titles[0]})` : x.name)))}`;
  const tail = `${o.onService ? " On one of your services." : ""}`;
  if (o.by.length) {
    const named = o.by.slice(0, 2).map((x) => PHRASE[x.how](x.t)), more = o.by.length - 2;
    return `Because ${list(named)}${more > 0 ? ` (and ${more} more like it)` : ""}${cast ? `. ${cast}` : ""}${g ? `. Also fits your taste for ${g}` : ""}${rate ? `; ${rate}` : ""}.${tail}`;
  }
  if (cast) return `${cast}${g ? `. Also fits your taste for ${g}` : ""}${rate ? `; ${rate}` : ""}.${tail}`;
  if (o.explore) return `A change of pace: ${rate || "well rated"}, outside your usual genres${g ? ` (${g})` : ""}. Shown now and then so the list does not get stuck.`;
  return `Well liked in genres you lean towards${g ? ` (${g})` : ""}${rate ? `: ${rate}` : ""}.${tail}`;
}
