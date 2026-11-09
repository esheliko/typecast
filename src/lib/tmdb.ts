import { cache } from "react";
import { genresFor, interleave, type BrowseQuery, type Tag } from "./browse";
import { sumEpisodes, type SeriesTime } from "./stats";
import { shapeCrew, type CrewBy } from "./details";
import type { EpisodeFacts } from "./new-episode";
import { releaseByCountry } from "./release-dates";
import type { Appearances, BrowseItem, BrowseList, BrowseType, CastMember, Credit, Episode, EpisodeLite, Item, MediaType, Person, ProviderGroup, Related, SearchHit, ShowInfo, Title } from "./types";

const BASE = process.env.TMDB_BASE_URL ?? "https://api.themoviedb.org/3";
const HOUR = 3600;

export class TmdbError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function tmdb(path: string, params: Record<string, string> = {}, revalidate = 6 * HOUR): Promise<any> {
  const token = process.env.TMDB_TOKEN;
  if (!token) throw new TmdbError(500, "TMDB_TOKEN is not set on the server.");
  const u = new URL(BASE + path);
  u.searchParams.set("language", process.env.TMDB_LANGUAGE ?? "en-US");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json" };
  if (token.includes(".")) headers.Authorization = `Bearer ${token}`; else u.searchParams.set("api_key", token);
  let r: Response;
  try { r = await fetch(u, { headers, next: { revalidate } }); }
  catch { throw new TmdbError(502, "Cannot reach TMDB."); }
  if (r.status === 401) throw new TmdbError(500, "TMDB rejected the server token.");
  if (r.status === 404) throw new TmdbError(404, "Not found on TMDB.");
  if (r.status === 429) throw new TmdbError(429, "TMDB is busy. Try again in a moment.");
  if (!r.ok) throw new TmdbError(502, `TMDB returned ${r.status}.`);
  return r.json();
}

const yr = (d?: string) => (d ?? "").slice(0, 4);
function item(type: MediaType, r: any): Item {
  return { key: `${type}:${r.id}`, type, id: r.id, title: r.title ?? r.name ?? "", year: yr(r.release_date ?? r.first_air_date), poster: r.poster_path ?? null };
}

function hit(r: any, media?: string): SearchHit | null {
  const m = media ?? r.media_type;
  if (m === "person") return { kind: "person", id: r.id, name: r.name, photo: r.profile_path ?? null, dept: r.known_for_department ?? "", knownFor: (r.known_for ?? []).map((k: any) => k.title ?? k.name).slice(0, 3),
    knownKeys: (r.known_for ?? []).slice(0, 3).map((k: any) => `${k.media_type}:${k.id}`), pop: r.popularity ?? 0 };
  if (m === "movie" || m === "tv") return { kind: "title", ...browseItem(m, r), pop: r.popularity ?? 0, votes: r.vote_count ?? 0 };
  return null;
}

/** Search everything, or only people / only titles (used by the connection pickers). */
export async function search(q: string, kind: "all" | "person" | "title" = "all"): Promise<SearchHit[]> {
  // TMDB ranks mostly by popularity, so a short query like "la la" can bury the right title.
  // Pull several result sets, then re-rank them ourselves by how well the name matches.
  const calls: [string, string?, string?][] =
    kind === "person" ? [["/search/person", "person"], ["/search/person", "person", "2"]]
    : kind === "title" ? [["/search/movie", "movie"], ["/search/tv", "tv"], ["/search/multi"], ["/search/movie", "movie", "2"]]
    : [["/search/multi"], ["/search/multi", undefined, "2"], ["/search/movie", "movie"], ["/search/tv", "tv"], ["/search/person", "person"]];
  // For one or two words TMDB matches loosely ("la la" is 10,000 hits), and the film you mean can sit on page 2 (La La Land does).
  if (kind === "all" && q.trim().split(/\s+/).length <= 2) calls.push(["/search/movie", "movie", "2"], ["/search/tv", "tv", "2"]);
  const sets = await Promise.all(calls.map(([path, media, page]) =>
    tmdb(path, { query: q, include_adult: "false", ...(page ? { page } : {}) }, HOUR)
      .then((d) => (d.results ?? []).map((r: any) => ({ r, media })))
      .catch((e) => { if (path === "/search/multi" && !page) throw e; return []; })));
  const seen = new Set<string>();
  const scored: { h: SearchHit; s: number }[] = [];
  for (const { r, media } of sets.flat() as { r: any; media?: string }[]) {
    const h = hit(r, media);
    if (!h || (kind !== "all" && h.kind !== kind)) continue;
    const id = h.kind === "person" ? `p:${h.id}` : h.key;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = h.kind === "person" ? h.name : h.title;
    scored.push({ h, s: matchScore(q, name, r.popularity ?? 0, r.vote_average ?? 0, r.vote_count ?? 0) });
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.h).slice(0, kind === "all" ? 24 : 8);
}

/** Film collections ("James Bond Collection") whose name contains what was typed; each with its films in release order. At most two. */
export async function searchCollections(q: string): Promise<{ id: number; name: string; items: BrowseItem[] }[]> {
  const want = norm(q).replace(/ (collection|franchise|series|films?|movies?)$/, "");
  if (want.length < 3) return [];
  const d = await tmdb("/search/collection", { query: q, include_adult: "false" }, HOUR).catch(() => ({ results: [] }));
  const ok = (d.results ?? []).filter((c: any) => (" " + norm(c.name ?? "") + " ").includes(" " + want + " ")).slice(0, 2);
  const full = await Promise.all(ok.map((c: any) => tmdb(`/collection/${c.id}`, {}, 24 * HOUR).then((x) => ({ id: c.id as number, name: (x.name ?? c.name) as string, parts: x.parts ?? [] })).catch(() => null)));
  return full.filter((c): c is NonNullable<typeof c> => !!c && c.parts.length > 1).map((c) => ({
    id: c.id, name: c.name,
    items: [...c.parts].sort((a: any, b: any) => (a.release_date || "9").localeCompare(b.release_date || "9")).map((r: any) => browseItem("movie", r)),
  }));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** Higher is better: exact name, then name starting with the query, then whole words, then anywhere; popularity and rating weigh in heavily. */
function matchScore(q: string, name: string, popularity: number, rating = 0, votes = 0): number {
  const a = norm(q), b = norm(name);
  const words = a.split(" ");
  const bw = b.split(" ");
  let s = 0;
  if (b === a) s = 300;
  else if (b.startsWith(a + " ")) s = 220;
  else if (b.startsWith(a)) s = 200;
  else if ((" " + b + " ").includes(" " + a + " ")) s = 150;
  else if (b.includes(a)) s = 100;
  else {
    const hit = words.filter((w) => bw.some((x) => x.startsWith(w))).length;
    s = 100 * (hit / words.length);
  }
  // Name match sets the tier, but popularity and rating (weighted by vote count) can lift a well-known title over an obscure exact match.
  return s + Math.min(Math.log10(1 + popularity) * 100, 300) + rating * Math.min(votes / 1000, 1) * 10;
}

const daysFrom = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** One page of a quick list (Trending, Popular…). Detailed filtering goes through discover() below. */
export async function browse(list: BrowseList, type: BrowseType, page: number): Promise<{ items: BrowseItem[]; more: boolean }> {
  if (type === "all") {
    const [m, t] = await Promise.all([browse(list, "movie", page), browse(list, "tv", page)]);
    return { items: interleave(m.items, t.items), more: m.more || t.more };
  }
  const date = type === "movie" ? "primary_release_date" : "first_air_date";
  const params: Record<string, string> = { page: String(page) };
  const path = list === "soon" ? `/discover/${type}`
    : list === "trending" ? `/trending/${type}/week`
    : list === "popular" ? `/${type}/popular`
    : list === "top" ? `/${type}/top_rated`
    : type === "movie" ? "/movie/now_playing" : "/tv/on_the_air";
  if (list === "soon") Object.assign(params, { include_adult: "false", sort_by: "popularity.desc", [`${date}.gte`]: daysFrom(1), [`${date}.lte`]: daysFrom(180) });
  const d = await tmdb(path, params, HOUR);
  return { items: (d.results ?? []).map((r: any) => browseItem(type, r)), more: page < Math.min(d.total_pages ?? 1, 200) };
}

/** One cast entry. A series lists every part someone played and how many episodes they were in, most episodes first. */
function member(type: MediaType, c: any): CastMember {
  if (type !== "tv") return { id: c.id, name: c.name, photo: c.profile_path ?? null, role: c.character ?? "" };
  const sorted: any[] = [...(c.roles ?? [])].sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0));
  // "Joel Miller" and "Joel Miller (uncredited)" are one part.
  const names = [...new Set(sorted.map((r) => String(r.character ?? "").replace(/\s*\((uncredited|archive footage)\)\s*$/i, "").trim()).filter(Boolean))];
  return {
    id: c.id, name: c.name, photo: c.profile_path ?? null,
    role: names.slice(0, 2).join(" / ") + (names.length > 2 ? ` +${names.length - 2}` : ""),
    eps: c.total_episode_count ?? undefined,
    credits: (c.roles ?? []).map((r: any) => r.credit_id).filter(Boolean).slice(0, 6),
  };
}

const epLite = (x: any): EpisodeLite => ({
  s: x.season_number, e: x.episode_number, name: x.name ?? "", air: x.air_date ?? "", runtime: x.runtime ?? null,
  rating: Math.round((x.vote_average ?? 0) * 10) / 10, votes: x.vote_count ?? 0, ...(x.episode_type === "finale" ? { finale: true } : {}),
});

function showInfo(d: any): ShowInfo {
  return {
    first: d.first_air_date ?? "", last: d.last_air_date ?? "", seasons: d.number_of_seasons ?? 0, episodes: d.number_of_episodes ?? 0,
    status: d.status ?? "", next: d.next_episode_to_air ? epLite(d.next_episode_to_air) : null, latest: d.last_episode_to_air ? epLite(d.last_episode_to_air) : null,
  };
}

export async function getTitle(type: MediaType, id: number): Promise<Title> {
  const append = `${type === "tv" ? "aggregate_credits" : "credits"},watch/providers,recommendations,external_ids${type === "movie" ? ",release_dates" : ""}`;
  const d = await tmdb(`/${type}/${id}`, { append_to_response: append });
  const cast: any[] = (type === "tv" ? d.aggregate_credits?.cast : d.credits?.cast) ?? [];
  const prov: Record<string, ProviderGroup> = {};
  for (const [cc, o] of Object.entries<any>(d["watch/providers"]?.results ?? {})) {
    const g: ProviderGroup = { link: o.link };
    for (const k of ["flatrate", "free", "ads", "rent", "buy"] as const) {
      if (o[k]) g[k] = o[k].map((p: any) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ?? null }));
    }
    prov[cc] = g;
  }
  const people: CastMember[] = cast.slice(0, 24).map((c) => member(type, c));
  const crewBy = shapeCrew(type, (type === "tv" ? d.aggregate_credits?.crew : d.credits?.crew) ?? [], d.created_by ?? []);
  return {
    ...item(type, d),
    overview: d.overview ?? "", tagline: d.tagline ?? "", genres: (d.genres ?? []).map((g: any) => g.name),
    runtime: (type === "movie" ? d.runtime : d.episode_run_time?.[0]) ?? null, status: d.status ?? "",
    ...(type === "movie" ? { release: (d.release_date ?? "") as string, releaseBy: releaseByCountry(d.release_dates?.results) } : {}),
    crew: crewBy.director.map((p) => p.name), crewBy,
    seasons: type === "tv" ? (d.seasons ?? []).filter((s: any) => s.season_number > 0).map((s: any) => ({ n: s.season_number, eps: s.episode_count })) : [],
    imdbId: d.external_ids?.imdb_id || d.imdb_id || null,
    people, prov, collection: d.belongs_to_collection?.id ?? null,
    ...(type === "tv" ? { show: showInfo(d), extras: cast.slice(24, 400).map((c) => member(type, c)) } : {}),
    related: (d.recommendations?.results ?? []).slice(0, 8).map((r: any): Related => {
      const mine = new Map<number, string>((d.genres ?? []).map((g: any) => [g.id, g.name]));
      const shared = ((r.genre_ids ?? []) as number[]).filter((g) => mine.has(g)).map((g) => mine.get(g)!).slice(0, 3);
      return { ...item(type, r), rel: shared.length ? `Recommended for fans of this: also ${shared.join(", ")}` : "Recommended for fans of this" };
    }),
  };
}

/**
 * How long a series is: every episode that has aired, at the runtime TMDB lists for that episode (one cached call per season).
 * Episodes with no runtime take the show's usual episode length and are counted as `guessed`.
 */
export async function getSeriesTime(id: number): Promise<SeriesTime> {
  const d = await tmdb(`/tv/${id}`, {}, 6 * HOUR);
  const last = d.last_episode_to_air?.runtime;
  const typical: number | null = d.episode_run_time?.[0] || (last > 0 && last <= 90 ? last : null) || null;
  const seasons: number[] = ((d.seasons ?? []) as any[]).map((x) => x.season_number as number).filter((n) => n > 0);
  const today = new Date().toISOString().slice(0, 10);
  const eps: { air: string | null; runtime: number | null }[] = [];
  for (const n of seasons) {
    const sd = await tmdb(`/tv/${id}/season/${n}`, {}, 6 * HOUR);
    for (const e of (sd.episodes ?? []) as any[]) eps.push({ air: e.air_date ?? null, runtime: e.runtime ?? null });
  }
  return sumEpisodes(eps, typical, today);
}

/** Air date (YYYY-MM-DD) of the newest episode that has already aired, or null. Cached 6 hours. */
export async function getLastAired(id: number): Promise<string | null> {
  return (await getEpisodeFacts(id)).last?.date ?? null;
}

/** The newest aired episode and when each season began (one cached call, shared with getLastAired). */
export async function getEpisodeFacts(id: number): Promise<EpisodeFacts> {
  const d = await tmdb(`/tv/${id}`, {}, 6 * HOUR);
  const l = d.last_episode_to_air;
  return {
    last: l?.air_date ? { s: l.season_number ?? 1, e: l.episode_number ?? 1, date: l.air_date } : null,
    seasons: ((d.seasons ?? []) as any[]).map((x) => ({ n: x.season_number as number, air: (x.air_date ?? null) as string | null })),
  };
}

/**
 * When a title next arrives, for "Upcoming from your list": a film's release date, or a series' next episode (with where it streams).
 * Films are cached 12 hours, series 6 (schedules shift). `date` is "" when TMDB has no future date.
 */
export async function getUpcomingFacts(type: MediaType, id: number): Promise<{ title: string; date: string; byCountry?: Record<string, string>; s?: number; e?: number; epName?: string; prov: Record<string, { id: number; name: string }[]> }> {
  if (type === "movie") {
    // `date` is the primary release date; `byCountry` has the theatrical/digital date for each country (see release-dates.ts).
    const d = await tmdb(`/movie/${id}`, { append_to_response: "release_dates" }, 12 * HOUR);
    return { title: d.title ?? "", date: (d.release_date ?? "") as string, byCountry: releaseByCountry(d.release_dates?.results), prov: {} };
  }
  const d = await tmdb(`/tv/${id}`, { append_to_response: "watch/providers" }, 6 * HOUR);
  const n = d.next_episode_to_air;
  const prov: Record<string, { id: number; name: string }[]> = {};
  for (const [cc, o] of Object.entries<any>(d["watch/providers"]?.results ?? {})) {
    prov[cc] = [...(o.flatrate ?? []), ...(o.free ?? []), ...(o.ads ?? [])].map((p: any) => ({ id: p.provider_id as number, name: p.provider_name as string }));
  }
  return { title: d.name ?? "", date: (n?.air_date ?? "") as string, s: n?.season_number, e: n?.episode_number, epName: n?.name, prov };
}

/** The few facts Watch next ranks by: genres, rating, length, dates, where it streams, and what it recommends. Small and cached 12 hours. */
export async function getPickBasics(type: MediaType, id: number) {
  const d = await tmdb(`/${type}/${id}`, { append_to_response: "watch/providers,recommendations" }, 12 * HOUR);
  const prov: Record<string, number[]> = {};
  const names = new Map<number, string>();
  for (const [cc, o] of Object.entries<any>(d["watch/providers"]?.results ?? {})) {
    prov[cc] = [...(o.flatrate ?? []), ...(o.free ?? []), ...(o.ads ?? [])].map((p: any) => { names.set(p.provider_id, p.provider_name); return p.provider_id as number; });
  }
  return {
    genres: ((d.genres ?? []) as any[]).map((g) => g.id as number), vote: d.vote_average ?? 0, votes: d.vote_count ?? 0,
    runtime: ((type === "movie" ? d.runtime : d.episode_run_time?.[0] || (d.last_episode_to_air?.runtime <= 90 ? d.last_episode_to_air.runtime : null)) || null) as number | null,
    released: (d.release_date ?? d.first_air_date ?? "") as string, lastAired: (d.last_episode_to_air?.air_date ?? null) as string | null,
    nextAir: (d.next_episode_to_air?.air_date ?? null) as string | null,
    prov, names,
    recs: ((d.recommendations?.results ?? []) as any[]).slice(0, 12).map((r) => ({
      ...item(type, r), vote: r.vote_average ?? 0, votes: r.vote_count ?? 0, genres: (r.genre_ids ?? []) as number[], released: (r.release_date ?? r.first_air_date ?? "") as string,
    })),
  };
}

/** Cast and sorted crew for one title, without the rest of the page's data (cached a day). Used by the browse glance. */
export async function getTitleCredits(type: MediaType, id: number): Promise<{ cast: CastMember[]; crewBy: CrewBy }> {
  const key = type === "tv" ? "aggregate_credits" : "credits";
  const d = await tmdb(`/${type}/${id}`, { append_to_response: key }, 24 * HOUR);
  const c = d[key] ?? {};
  const cast: CastMember[] = (c.cast ?? []).slice(0, 24).map((p: any) => ({
    id: p.id, name: p.name, photo: p.profile_path ?? null, role: type === "tv" ? p.roles?.[0]?.character ?? "" : p.character ?? "",
  }));
  return { cast, crewBy: shapeCrew(type, c.crew ?? [], d.created_by ?? []) };
}

export async function getCollection(id: number): Promise<Related[]> {
  const d = await tmdb(`/collection/${id}`, {}, 24 * HOUR);
  return [...(d.parts ?? [])].sort((a: any, b: any) => (a.release_date || "9").localeCompare(b.release_date || "9")).map((r: any): Related => ({ ...item("movie", r), rel: "Same collection" }));
}

/** A set of titles that belong together, in release order. */
export interface FranchiseGroup { label: string; items: Item[]; /** Which way of finding related titles produced it (see the picker in the related popup). */ by?: "creator" | "names" | "recommended" | "themes" }

const UNIVERSE_KW = /universe|franchise|cinematic|saga|\bmcu\b|dceu|verse$/i;
const niceName = (s: string) => s.replace(/\s*\(.*?\)\s*/g, " ").trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const ROMAN = "ii|iii|iv|v|vi|vii|viii|ix|x";
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/^(the|a|an) /, "");
/** "Sausage Party: Foodtopia" -> "sausage party", "Toy Story 4" -> "toy story". Empty when too generic to match on. */
export function franchiseBase(title: string): string {
  const head = title.split(/\s*[:\u2013\u2014]\s*|\s+-\s+/)[0];
  const base = plain(head).replace(new RegExp(`\\s+(part\\s+)?(\\d{1,2}|${ROMAN})$`), "").trim();
  return base.length >= 8 || base.split(" ").length >= 2 ? base : "";
}

/**
 * Every name a title's franchise might go by: its own base ("Toy Story 4" -> "toy story") and the franchise a
 * subtitle names ("Rogue One: A Star Wars Story" -> "rogue one", "star wars").
 */
export function franchiseNames(title: string): string[] {
  const out: string[] = [];
  const base = franchiseBase(title);
  if (base) out.push(base);
  const tail = title.split(/\s*[:\u2013\u2014]\s*|\s+-\s+/).slice(1).join(" ");
  const m = /^(?:an?|the)\s+(.+?)\s+(?:story|movie|film|saga|adventure|chapter)$/i.exec(tail.trim());
  if (m) {
    const n = plain(m[1]);
    if ((n.length >= 8 || n.split(" ").length >= 2) && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Titles that go with this one: the rest of its collection (Iron Man 2, 3), and everything under a shared
 * "universe" theme (the whole Marvel Cinematic Universe). Unreleased titles are left out, nothing can be watched yet.
 */
export const getFranchise = cache(async (type: MediaType, id: number): Promise<FranchiseGroup[]> => {
  const d = await tmdb(`/${type}/${id}`, { append_to_response: "keywords" }, 24 * HOUR);
  const self = `${type}:${id}`;
  const date = type === "movie" ? "primary_release_date" : "first_air_date";
  const out: FranchiseGroup[] = [];
  const have = new Set<string>([self]);
  const when = (r: any): string => r.release_date || r.first_air_date || "";
  const keep = (rows: any[], t: MediaType) => rows
    .filter((r) => r.poster_path && when(r) && when(r) <= today())
    .sort((a, b) => when(a).localeCompare(when(b)))
    .map((r) => item(t, r)).filter((i) => !have.has(i.key) && have.add(i.key));

  const names = franchiseNames(d.title ?? d.name ?? "");
  const kws: any[] = (type === "movie" ? d.keywords?.keywords : d.keywords?.results) ?? [];
  const startsWith = (n: string) => names.some((b) => n === b || n.startsWith(b + " "));

  // Themes: a "universe"-style keyword, or a keyword that is the franchise's own name (the "star wars" keyword on Rogue One).
  // When the title doesn't carry such a keyword, look the franchise name up as a keyword.
  const themeKws: { id: number; name: string }[] = [];
  const addKw = (k: any) => { if (k && !themeKws.some((t) => t.id === k.id)) themeKws.push({ id: k.id, name: k.name }); };
  addKw(kws.find((k) => UNIVERSE_KW.test(k.name)));
  addKw(kws.find((k) => names.includes(plain(k.name))));
  if (!themeKws.length && names.length) {
    const found = await Promise.all(names.map((n) => tmdb("/search/keyword", { query: n }, 24 * HOUR).then((r) => (r.results ?? []).find((k: any) => plain(k.name) === n)).catch(() => null)));
    found.forEach(addKw);
  }
  const themeFor = (kw: { id: number }) => Promise.all([1, 2, 3].map((p) => tmdb(`/discover/${type}`, {
    with_keywords: String(kw.id), sort_by: "popularity.desc", include_adult: "false", "vote_count.gte": "150", [`${date}.lte`]: today(), page: String(p),
  }, 24 * HOUR).catch(() => ({ results: [] })))).catch(() => null);

  // The collections, the same-name searches and the theme pages don't depend on each other: fetch them together, then assemble in order.
  const [coll, extraColls, named, themed] = await Promise.all([
    d.belongs_to_collection?.id ? tmdb(`/collection/${d.belongs_to_collection.id}`, {}, 24 * HOUR).catch(() => null) : null,
    // Collections TMDB didn't link to this title, found by the franchise name (the "Star Wars Collection" for Rogue One).
    Promise.all(names.map((n) => tmdb("/search/collection", { query: n }, 24 * HOUR)
      .then((r) => Promise.all((r.results ?? []).filter((c: any) => startsWith(plain(c.name ?? "")) && c.id !== d.belongs_to_collection?.id).slice(0, 2)
        .map((c: any) => tmdb(`/collection/${c.id}`, {}, 24 * HOUR).catch(() => null))))
      .catch(() => []))).then((a) => a.flat().filter(Boolean)).catch(() => []),
    // Sequels and spin-offs TMDB never linked (a film and its later series): other titles that start with a franchise name.
    names.length ? Promise.all(names.flatMap((n) => (["movie", "tv"] as const).map((t) =>
      tmdb(`/search/${t}`, { query: n, include_adult: "false" }, 24 * HOUR).then((r) => (r.results ?? []).map((x: any) => ({ x, t }))).catch(() => [])))).catch(() => null) : null,
    Promise.all(themeKws.map(themeFor)),
  ]);

  if (coll) {
    const items = keep(coll.parts ?? [], "movie");
    if (items.length) out.push({ label: coll.name || d.belongs_to_collection.name || "Same collection", items });
  }
  for (const c of extraColls as any[]) {
    const items = keep(c.parts ?? [], "movie");
    if (items.length) out.push({ label: c.name || "Same collection", items });
  }
  if (named) {
    const items: Item[] = [];
    for (const { x, t } of named.flat()) {
      if (startsWith(plain(x.title ?? x.name ?? "")) && (x.vote_count ?? 0) >= 10) items.push(...keep([x], t));
    }
    items.sort((a, b) => a.year.localeCompare(b.year));
    const head = names.length > 1 ? names[names.length - 1] : (d.title ?? d.name ?? names[0]).split(/\s*[:\u2013\u2014]\s*/)[0];
    if (items.length) out.push({ label: `More "${niceName(head)}"`, items: items.slice(0, 20) });
  }
  themed.forEach((pages, i) => {
    if (!pages) return;
    const items = keep(pages.flatMap((p: any) => p.results ?? []), type).slice(0, 80);
    if (items.length) out.push({ label: niceName(themeKws[i].name), items });
  });
  return out;
});

/**
 * Fallback for titles with no collection or universe: loosely related titles, found by similar names (first words of the title),
 * TMDB's own recommendations and "similar" lists, and shared keywords. Unreleased titles are left out.
 */
const CREATOR_MAX = 12;
export const getSimilar = cache(async (type: MediaType, id: number): Promise<FranchiseGroup[]> => {
  const d = await tmdb(`/${type}/${id}`, { append_to_response: "keywords,recommendations,similar" }, 24 * HOUR);
  const title: string = d.title ?? d.name ?? "";
  const have = new Set<string>([`${type}:${id}`]);
  const when = (r: any): string => r.release_date || r.first_air_date || "";
  const keep = (rows: any[], t: MediaType) => rows
    .filter((r) => r.poster_path && when(r) && when(r) <= today())
    .map((r) => item(t, r)).filter((i) => !have.has(i.key) && have.add(i.key));
  const out: FranchiseGroup[] = [];
  // Same creator: the strongest signal for a distinctive author (a series' creator, a film's director). Their other work comes first.
  // Skipped for prolific people (more than CREATOR_MAX credits in that role), where "same person" says little about similarity.
  const makers: { id: number }[] = type === "tv" ? (d.created_by ?? []) : [];
  if (type === "movie") {
    const cr = await tmdb(`/movie/${id}/credits`, {}, 24 * HOUR).catch(() => null);
    const dir = (cr?.crew ?? []).find((c: any) => c.job === "Director");
    if (dir) makers.push({ id: dir.id });
  }
  if (makers.length) {
    const roles = type === "tv" ? ["Creator", "Director", "Writer"] : ["Director"];
    const lists = await Promise.all(makers.slice(0, 2).map((m) => tmdb(`/person/${m.id}/combined_credits`, {}, 24 * HOUR).then((c) => {
      const rows = (c.crew ?? []).filter((r: any) => roles.includes(r.job) && (r.media_type === "movie" || r.media_type === "tv"));
      const byKey = new Map<string, any>(); for (const r of rows) byKey.set(`${r.media_type}:${r.id}`, r);
      return byKey.size <= CREATOR_MAX ? [...byKey.values()] : [];
    }).catch(() => [])));
    const rows = lists.flat().filter((r: any) => (r.vote_count ?? 0) >= 5).sort((a: any, b: any) => (when(a)).localeCompare(when(b)));
    const same: Item[] = [];
    for (const r of rows) same.push(...keep([r], r.media_type));
    if (same.length) out.push({ label: "Same creator", by: "creator", items: same.slice(0, 20) });
  }
  // Similar names: the title before any subtitle, then its first two words.
  const head = title.split(/\s*[:\u2013\u2014-]\s*/)[0].trim();
  const words = plain(head).split(" ").filter(Boolean);
  const queries = [...new Set([head, words.slice(0, 2).join(" ")].filter((q) => q.length >= 3))];
  const named = await Promise.all(queries.flatMap((q) => (["movie", "tv"] as const).map((t) =>
    tmdb(`/search/${t}`, { query: q, include_adult: "false" }, 24 * HOUR).then((r) => (r.results ?? []).slice(0, 10).map((x: any) => ({ x, t }))).catch(() => [])))).catch(() => []);
  const nm: Item[] = [];
  for (const { x, t } of named.flat() as { x: any; t: MediaType }[]) nm.push(...keep([x], t));
  if (nm.length) out.push({ label: "Similar names", by: "names", items: nm.slice(0, 16) });
  const rec = keep(d.recommendations?.results ?? [], type);
  if (rec.length) out.push({ label: "Recommended", by: "recommended", items: rec.slice(0, 20) });
  const sim = keep(d.similar?.results ?? [], type);
  if (sim.length) out.push({ label: "Similar titles", by: "recommended", items: sim.slice(0, 20) });
  const kws: any[] = (type === "movie" ? d.keywords?.keywords : d.keywords?.results) ?? [];
  if (kws.length) {
    const date = type === "movie" ? "primary_release_date" : "first_air_date";
    const r = await tmdb(`/discover/${type}`, { with_keywords: kws.slice(0, 3).map((k) => k.id).join("|"), sort_by: "popularity.desc", include_adult: "false", "vote_count.gte": "100", [`${date}.lte`]: today() }, 24 * HOUR).catch(() => ({ results: [] }));
    const kw = keep(r.results ?? [], type);
    if (kw.length) out.push({ label: "Shared themes", by: "themes", items: kw.slice(0, 20) });
  }
  return out;
});

const BAD_ROLE = /\b(self|himself|herself|themselves|archive footage|uncredited)\b/i;
async function personRaw(id: number) {
  const d = await tmdb(`/person/${id}`, { append_to_response: "combined_credits,external_ids" }, 24 * HOUR);
  const cc = d.combined_credits ?? {};
  const seen = new Set<string>(); const known: Credit[] = [];
  const add = (r: any, role: string) => {
    if (r.media_type !== "movie" && r.media_type !== "tv") return;
    const it = item(r.media_type, r); if (seen.has(it.key)) return; seen.add(it.key);
    known.push({ ...it, role, votes: r.vote_count ?? 0, rating: r.vote_average ?? 0, date: r.release_date ?? r.first_air_date ?? "" });
  };
  for (const r of cc.cast ?? []) {
    if (BAD_ROLE.test(r.character ?? "")) continue;
    if ((r.genre_ids ?? []).some((g: number) => g === 10767 || g === 10763 || g === 10764)) continue;
    add(r, r.character ?? "");
    // A series can hold several parts by the same person (one credit each): add up their episodes and keep every credit id.
    const own = r.media_type === "tv" ? known.find((k) => k.key === `tv:${r.id}`) : undefined;
    if (own) {
      if (r.episode_count) own.eps = (own.eps ?? 0) + r.episode_count;
      if (r.first_credit_air_date && (!own.since || r.first_credit_air_date < own.since)) own.since = r.first_credit_air_date;
      if (r.credit_id) own.cids = [...(own.cids ?? []), r.credit_id];
    }
  }
  const dept: string = d.known_for_department ?? "";
  if (dept === "Directing") {
    for (const r of cc.crew ?? []) if (r.job === "Director") add(r, "Director");
  } else if (dept && dept !== "Acting") {
    // Composers, cinematographers, writers…: list their own department's work so their page isn't empty.
    for (const r of cc.crew ?? []) if (r.department === dept) add(r, r.job ?? "");
  }
  known.sort((a, b) => b.votes - a.votes);
  return { d, known };
}

export async function getPerson(id: number): Promise<Person> {
  const { d, known } = await personRaw(id);
  return { id: d.id, name: d.name, photo: d.profile_path ?? null, dept: d.known_for_department ?? "", bio: (d.biography ?? "").slice(0, 360), known: known.slice(0, 200), imdbId: d.external_ids?.imdb_id || d.imdb_id || null };
}

/** Every acting (or directing) credit for a person, most-voted first. Same request as getPerson, so it shares its cache. */
export async function getAllCredits(id: number): Promise<{ id: number; name: string; photo: string | null; known: Credit[] }> {
  const { d, known } = await personRaw(id);
  return { id: d.id, name: d.name, photo: d.profile_path ?? null, known };
}

/** The full billed cast of a film, or everyone who appeared across a series. */
export async function getCast(type: MediaType, id: number, limit = 60): Promise<CastMember[]> {
  const d = await tmdb(type === "tv" ? `/tv/${id}/aggregate_credits` : `/movie/${id}/credits`, {}, 24 * HOUR);
  return (d.cast ?? []).filter((c: any) => !BAD_ROLE.test(type === "tv" ? c.roles?.[0]?.character ?? "" : c.character ?? "")).slice(0, limit).map((c: any) => ({
    id: c.id, name: c.name, photo: c.profile_path ?? null,
    role: type === "tv" ? c.roles?.[0]?.character ?? "" : c.character ?? "",
  }));
}

/** A film's whole billed cast, cameos and "Self" parts included (unlike `getCast`), in billing order. */
export async function getFullCast(id: number): Promise<(CastMember & { order: number })[]> {
  const d = await tmdb(`/movie/${id}/credits`, {}, 24 * HOUR);
  return ((d.cast ?? []) as any[]).map((c, i) => ({ id: c.id as number, name: c.name as string, photo: (c.profile_path ?? null) as string | null, role: (c.character ?? "") as string, order: (c.order ?? i) as number }));
}

export async function getEpisode(tv: number, s: number, e: number) {
  const d = await tmdb(`/tv/${tv}/season/${s}/episode/${e}`, { append_to_response: "credits" }, 24 * HOUR);
  const map = (a: any[] = []): CastMember[] => a.map((p) => ({ id: p.id, name: p.name, photo: p.profile_path ?? null, role: p.character ?? "", ...(p.credit_id ? { credits: [p.credit_id] } : {}) }));
  return { name: (d.name ?? "") as string, cast: map(d.credits?.cast).slice(0, 12), guests: map(d.credits?.guest_stars).slice(0, 20) };
}

/** Every episode of one season with its air date, guest stars and who directed and wrote it. Cached 6 hours (new episodes get dates). */
export async function getSeason(tv: number, s: number, opts: { selves?: boolean } = {}): Promise<{ name: string; air: string; episodes: Episode[] }> {
  const d = await tmdb(`/tv/${tv}/season/${s}`, {}, 6 * HOUR);
  const crew = (x: any, jobs: string[]) => [...new Set<string>((x.crew ?? []).filter((c: any) => jobs.includes(c.job)).map((c: any) => c.name))].slice(0, 3);
  return {
    name: d.name ?? `Season ${s}`, air: d.air_date ?? "",
    episodes: (d.episodes ?? []).map((x: any): Episode => ({
      ...epLite(x), overview: x.overview ?? "", still: x.still_path ?? null,
      directors: crew(x, ["Director"]), writers: crew(x, ["Writer", "Teleplay", "Story"]),
      guests: (x.guest_stars ?? []).filter((g: any) => opts.selves || !BAD_ROLE.test(g.character ?? "")).slice(0, 30)
        .map((g: any): CastMember => ({ id: g.id, name: g.name, photo: g.profile_path ?? null, role: g.character ?? "", ...(g.credit_id ? { credits: [g.credit_id] } : {}) })),
    })),
  };
}

/** The episodes an actor's parts in a series (their credit ids) list, in order. Guest parts list every one; regulars often only a few. */
export async function getCreditEpisodes(creditIds: string[]): Promise<EpisodeLite[]> {
  const ds = await Promise.all(creditIds.slice(0, 4).map((id) => tmdb(`/credit/${id}`, {}, 24 * HOUR)));
  const all = new Map<string, EpisodeLite>();
  for (const d of ds) for (const x of (d.media?.episodes ?? []) as any[]) { const e = epLite(x); if (e.s > 0) all.set(`${e.s}:${e.e}`, e); }
  return [...all.values()].sort((a, b) => a.s - b.s || a.e - b.e);
}

/**
 * Where one person appears in a series, from their TMDB credit ids (one per part played). Guest parts list each episode;
 * regulars often list only a few, so when the list falls short of `total` (their episode count) the seasons are the answer.
 */
export async function getAppearances(tv: number, ids: string[], total: number): Promise<Appearances> {
  const [show, ...cs] = await Promise.all([
    tmdb(`/tv/${tv}`, {}, 24 * HOUR),
    ...ids.slice(0, 6).map((id) => tmdb(`/credit/${id}`, {}, 24 * HOUR).catch(() => null)),
  ]);
  const eps = new Map<string, EpisodeLite>(); const seasons = new Set<number>(); const roles: Appearances["roles"] = [];
  for (const c of cs) {
    const m = c?.media; if (!m || m.id !== tv) continue;
    const listed: any[] = (m.episodes ?? []).filter((x: any) => x.show_id === undefined || x.show_id === tv);
    if (m.character) roles.push({ role: m.character, eps: listed.length });
    for (const x of listed) { const e = epLite(x); eps.set(`${e.s}:${e.e}`, e); }
    for (const x of m.seasons ?? []) if (x.season_number > 0) seasons.add(x.season_number);
  }
  for (const e of eps.values()) if (e.s > 0) seasons.add(e.s);
  const complete = !total || eps.size >= total;
  return {
    roles: roles.sort((a, b) => b.eps - a.eps).map((r) => (complete ? r : { ...r, eps: 0 })), total: Math.max(total, eps.size),
    episodes: complete ? [...eps.values()].sort((a, b) => a.s - b.s || a.e - b.e) : [],
    seasons: [...seasons].sort((a, b) => a - b), showEpisodes: show.number_of_episodes ?? 0,
  };
}

export async function getProviders(cc: string) {
  // Regional lists first (accurate order for this country), then TMDB's global list so services
  // TMDB has not tagged for this region (e.g. Disney+, Israeli services) can still be picked.
  const [m, t, gm, gt] = await Promise.all([
    tmdb("/watch/providers/movie", { watch_region: cc }, 24 * HOUR),
    tmdb("/watch/providers/tv", { watch_region: cc }, 24 * HOUR),
    tmdb("/watch/providers/movie", {}, 24 * HOUR).catch(() => ({ results: [] })),
    tmdb("/watch/providers/tv", {}, 24 * HOUR).catch(() => ({ results: [] })),
  ]);
  const map = new Map<number, { id: number; name: string; pri: number }>();
  for (const [d, regional] of [[m, true], [t, true], [gm, false], [gt, false]] as const) for (const p of d.results ?? []) {
    const pri: number = regional ? p.display_priority : (p.display_priorities?.[cc] ?? 100 + (p.display_priority ?? 0));
    const o = map.get(p.provider_id);
    if (!o || pri < o.pri) map.set(p.provider_id, { id: p.provider_id, name: p.provider_name, pri });
  }
  return [...map.values()].sort((a, b) => a.pri - b.pri);
}

/* ---------- Browse ---------- */

export async function genreList(type: MediaType): Promise<Tag[]> {
  const d = await tmdb(`/genre/${type}/list`, {}, 24 * HOUR);
  return (d.genres ?? []).map((g: any) => ({ id: g.id, name: g.name }));
}

export interface Suggestion { id: number; name: string; sub: string }
export type SuggestKind = "person" | "company" | "keyword";

/** Type-ahead for the actor / studio / theme pickers. */
export async function suggest(kind: SuggestKind, q: string): Promise<Suggestion[]> {
  const d = await tmdb(`/search/${kind}`, { query: q, page: "1", include_adult: "false" }, HOUR);
  return (d.results ?? []).slice(0, 8).map((r: any): Suggestion => {
    if (kind === "person") return { id: r.id, name: r.name, sub: [r.known_for_department, (r.known_for ?? []).map((k: any) => k.title ?? k.name).slice(0, 2).join(", ")].filter(Boolean).join(" · ") };
    if (kind === "company") return { id: r.id, name: r.name, sub: r.origin_country ?? "" };
    return { id: r.id, name: r.name, sub: "" };
  });
}

export interface BrowsePage { items: BrowseItem[]; page: number; totalPages: number; notice?: string }
const PAGE_SIZE = 20;
const today = () => new Date().toISOString().slice(0, 10);
export const browseItem = (type: MediaType, r: any): BrowseItem => ({ ...item(type, r), rating: Math.round((r.vote_average ?? 0) * 10) / 10 });

/**
 * Browse films or series by genre, year, people, studio, theme, rating and where to stream.
 * TMDB's series discovery has no cast filter, so a series search with actors is answered from
 * the actors' own credits instead; that route can't also filter by studio, theme or service.
 */
export async function discover(q: BrowseQuery, page: number, region: string, services: number[]): Promise<BrowsePage> {
  page = Math.min(Math.max(1, Math.floor(page) || 1), 500);
  if (q.type === "all") {
    // Genres in a mixed search are the merged list; each type gets its own ids, and a type with no such genre is left out.
    const run = (type: MediaType): Promise<BrowsePage | null> => {
      const genres = genresFor(type, q.genres);
      return genres ? discover({ ...q, type, genres }, page, region, services) : Promise.resolve(null);
    };
    const [m, t] = await Promise.all([run("movie"), run("tv")]);
    const empty: BrowsePage = { items: [], page, totalPages: 1 };
    const [a, b] = [m ?? empty, t ?? empty];
    const only = !m ? "series" : !t ? "films" : undefined;
    return {
      items: interleave(a.items, b.items), page, totalPages: Math.max(a.totalPages, b.totalPages),
      notice: only ? `Only ${only} have this genre.` : a.notice ?? b.notice,
    };
  }
  if (q.type === "tv" && q.people.length) return tvByPeople(q, page);

  const type: MediaType = q.type;
  const movie = type === "movie";
  const date = movie ? "primary_release_date" : "first_air_date";
  const sortBy = { popular: "popularity.desc", rating: "vote_average.desc", newest: `${date}.desc`, oldest: `${date}.asc` }[q.sort];
  const p: Record<string, string> = { sort_by: sortBy, page: String(page), include_adult: "false" };
  if (q.from) p[`${date}.gte`] = `${q.from}-01-01`;
  if (q.to) p[`${date}.lte`] = `${q.to}-12-31`;
  if (q.sort === "newest" && !q.to) p[`${date}.lte`] = today();
  if (q.genres.length) p.with_genres = q.genres.join(",");
  if (q.people.length) p.with_people = q.people.map((t) => t.id).join(",");
  if (q.companies.length) p.with_companies = q.companies.map((t) => t.id).join("|");
  if (q.keywords.length) p.with_keywords = q.keywords.map((t) => t.id).join("|");
  if (q.minRating) p["vote_average.gte"] = String(q.minRating);
  if (q.minRating || q.sort === "rating") p["vote_count.gte"] = q.sort === "rating" ? "300" : "100";
  if (q.mine && services.length) {
    p.watch_region = region; p.with_watch_providers = services.join("|"); p.with_watch_monetization_types = "flatrate|free|ads";
  }
  const d = await tmdb(`/discover/${type}`, p, HOUR);
  return { items: (d.results ?? []).map((r: any) => browseItem(type, r)), page, totalPages: Math.min(d.total_pages ?? 1, 500) };
}

async function tvByPeople(q: BrowseQuery, page: number): Promise<BrowsePage> {
  const lists = await Promise.all(q.people.map((p) => tmdb(`/person/${p.id}/combined_credits`, {}, 24 * HOUR)));
  const sets = lists.map((d) => {
    const m = new Map<number, any>();
    for (const r of [...(d.cast ?? []), ...(d.crew ?? [])]) {
      if (r.media_type !== "tv" || m.has(r.id)) continue;
      if (BAD_ROLE.test(r.character ?? "")) continue;
      m.set(r.id, r);
    }
    return m;
  });
  const talk = (r: any) => (r.genre_ids ?? []).some((g: number) => g === 10767 || g === 10763 || g === 10764);
  const rows = [...sets[0].values()].filter((r) => sets.every((m) => m.has(r.id))).filter((r) => {
    const y = yr(r.first_air_date);
    if (q.from && (!y || y < q.from)) return false;
    if (q.to && (!y || y > q.to)) return false;
    if (q.genres.length ? !q.genres.every((g) => (r.genre_ids ?? []).includes(g)) : talk(r)) return false;
    if (q.minRating && (r.vote_average ?? 0) < q.minRating) return false;
    if (q.sort === "rating" && (r.vote_count ?? 0) < 50) return false;
    if (q.sort === "newest" && (r.first_air_date ?? "") > today()) return false;
    return true;
  });
  const dt = (r: any) => r.first_air_date || "";
  rows.sort({
    popular: (a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0),
    rating: (a: any, b: any) => (b.vote_average ?? 0) - (a.vote_average ?? 0),
    newest: (a: any, b: any) => dt(b).localeCompare(dt(a)),
    oldest: (a: any, b: any) => (dt(a) || "9").localeCompare(dt(b) || "9"),
  }[q.sort]);
  const ignored = [q.companies.length && "studio", q.keywords.length && "theme", q.mine && "streaming"].filter(Boolean);
  return {
    items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => browseItem("tv", r)),
    page, totalPages: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
    notice: ignored.length ? `Series searches with an actor can't also filter by ${ignored.join(", ")}, so that part is ignored.` : undefined,
  };
}

/** Facts the Watching-now answers need beyond getTitle: keywords (true story, post-credits scenes), money, dates, ratings, places. Cached a day. */
export interface TitleFacts {
  keywords: string[]; budget: number; revenue: number; release: string; votes: number; rating: number;
  countries: string[]; languages: string[]; companies: string[]; original: string;
}
export async function getTitleFacts(type: MediaType, id: number): Promise<TitleFacts> {
  const d = await tmdb(`/${type}/${id}`, { append_to_response: "keywords" }, 24 * HOUR);
  const kw: any[] = d.keywords?.keywords ?? d.keywords?.results ?? [];
  return {
    keywords: kw.map((k) => String(k.name ?? "").toLowerCase()).filter(Boolean),
    budget: d.budget ?? 0, revenue: d.revenue ?? 0, release: d.release_date ?? d.first_air_date ?? "",
    votes: d.vote_count ?? 0, rating: Math.round((d.vote_average ?? 0) * 10) / 10,
    countries: (d.production_countries ?? []).map((c: any) => c.name).filter(Boolean),
    languages: (d.spoken_languages ?? []).map((l: any) => l.english_name || l.name).filter(Boolean),
    companies: (d.production_companies ?? []).map((c: any) => c.name).filter(Boolean).slice(0, 4),
    original: d.original_title ?? d.original_name ?? "",
  };
}

/** Birthday, birthplace and the full biography of a person. Same request as getPerson, so it shares its cache. */
export async function getPersonBasics(id: number): Promise<{ id: number; name: string; photo: string | null; birthday: string; deathday: string; place: string; bio: string; imdbId: string | null }> {
  const { d } = await personRaw(id);
  return { id: d.id, name: d.name, photo: d.profile_path ?? null, birthday: d.birthday ?? "", deathday: d.deathday ?? "", place: d.place_of_birth ?? "", bio: d.biography ?? "", imdbId: d.external_ids?.imdb_id || null };
}
