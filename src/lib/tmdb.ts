import { interleave, type BrowseQuery, type Tag } from "./browse";
import { shapeCrew, type CrewBy } from "./details";
import type { BrowseItem, BrowseList, BrowseType, CastMember, Credit, Item, MediaType, Person, ProviderGroup, Related, SearchHit, Title } from "./types";

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
  if (m === "person") return { kind: "person", id: r.id, name: r.name, photo: r.profile_path ?? null, dept: r.known_for_department ?? "", knownFor: (r.known_for ?? []).map((k: any) => k.title ?? k.name).slice(0, 3) };
  if (m === "movie" || m === "tv") return { kind: "title", ...browseItem(m, r) };
  return null;
}

/** Search everything, or only people / only titles (used by the connection pickers). */
export async function search(q: string, kind: "all" | "person" | "title" = "all"): Promise<SearchHit[]> {
  const path = kind === "person" ? "/search/person" : "/search/multi";
  const d = await tmdb(path, { query: q, include_adult: "false" }, HOUR);
  const out = (d.results ?? []).map((r: any) => hit(r, kind === "person" ? "person" : undefined)).filter(Boolean) as SearchHit[];
  return out.filter((h) => kind === "all" || h.kind === kind).slice(0, kind === "all" ? 16 : 8);
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

export async function getTitle(type: MediaType, id: number): Promise<Title> {
  const append = `${type === "tv" ? "aggregate_credits" : "credits"},watch/providers,recommendations`;
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
  const people: CastMember[] = cast.slice(0, 24).map((c) => ({
    id: c.id, name: c.name, photo: c.profile_path ?? null,
    role: type === "tv" ? c.roles?.[0]?.character ?? "" : c.character ?? "",
  }));
  const crewBy = shapeCrew(type, (type === "tv" ? d.aggregate_credits?.crew : d.credits?.crew) ?? [], d.created_by ?? []);
  return {
    ...item(type, d),
    overview: d.overview ?? "", tagline: d.tagline ?? "", genres: (d.genres ?? []).map((g: any) => g.name),
    runtime: (type === "movie" ? d.runtime : d.episode_run_time?.[0]) ?? null, status: d.status ?? "",
    crew: crewBy.director.map((p) => p.name), crewBy,
    seasons: type === "tv" ? (d.seasons ?? []).filter((s: any) => s.season_number > 0).map((s: any) => ({ n: s.season_number, eps: s.episode_count })) : [],
    people, prov, collection: d.belongs_to_collection?.id ?? null,
    related: (d.recommendations?.results ?? []).slice(0, 8).map((r: any): Related => ({ ...item(type, r), rel: "Recommended" })),
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

const BAD_ROLE = /\b(self|himself|herself|themselves|archive footage|uncredited)\b/i;
async function personRaw(id: number) {
  const d = await tmdb(`/person/${id}`, { append_to_response: "combined_credits" }, 24 * HOUR);
  const cc = d.combined_credits ?? {};
  const seen = new Set<string>(); const known: Credit[] = [];
  const add = (r: any, role: string) => {
    if (r.media_type !== "movie" && r.media_type !== "tv") return;
    const it = item(r.media_type, r); if (seen.has(it.key)) return; seen.add(it.key);
    known.push({ ...it, role, votes: r.vote_count ?? 0 });
  };
  for (const r of cc.cast ?? []) {
    if (BAD_ROLE.test(r.character ?? "")) continue;
    if ((r.genre_ids ?? []).some((g: number) => g === 10767 || g === 10763 || g === 10764)) continue;
    add(r, r.character ?? "");
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
  return { id: d.id, name: d.name, photo: d.profile_path ?? null, dept: d.known_for_department ?? "", bio: (d.biography ?? "").slice(0, 360), known: known.slice(0, 60) };
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

export async function getEpisode(tv: number, s: number, e: number) {
  const d = await tmdb(`/tv/${tv}/season/${s}/episode/${e}`, { append_to_response: "credits" }, 24 * HOUR);
  const map = (a: any[] = []): CastMember[] => a.map((p) => ({ id: p.id, name: p.name, photo: p.profile_path ?? null, role: p.character ?? "" }));
  return { name: (d.name ?? "") as string, cast: map(d.credits?.cast).slice(0, 12), guests: map(d.credits?.guest_stars).slice(0, 20) };
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
    // Genre ids differ between films and series, so a mixed search ignores them.
    const both = { ...q, genres: [] };
    const [m, t] = await Promise.all([discover({ ...both, type: "movie" }, page, region, services), discover({ ...both, type: "tv" }, page, region, services)]);
    return { items: interleave(m.items, t.items), page, totalPages: Math.max(m.totalPages, t.totalPages), notice: m.notice ?? t.notice };
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
