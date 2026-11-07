import type { CastMember, Credit, Item, MediaType, Person, ProviderGroup, Related, SearchHit, Title } from "./types";

const BASE = process.env.TMDB_BASE_URL ?? "https://api.themoviedb.org/3";
const HOUR = 3600;

export class TmdbError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function tmdb(path: string, params: Record<string, string> = {}, revalidate = 6 * HOUR): Promise<any> {
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

export async function search(q: string): Promise<SearchHit[]> {
  const d = await tmdb("/search/multi", { query: q, include_adult: "false" }, HOUR);
  const out: SearchHit[] = [];
  for (const r of d.results ?? []) {
    if (r.media_type === "person") out.push({ kind: "person", id: r.id, name: r.name, photo: r.profile_path ?? null, dept: r.known_for_department ?? "", knownFor: (r.known_for ?? []).map((k: any) => k.title ?? k.name).slice(0, 3) });
    else if (r.media_type === "movie" || r.media_type === "tv") out.push({ kind: "title", ...item(r.media_type, r) });
  }
  return out.slice(0, 14);
}

export async function trending(): Promise<Item[]> {
  const d = await tmdb("/trending/all/week", {}, HOUR);
  return (d.results ?? []).filter((r: any) => r.media_type === "movie" || r.media_type === "tv").slice(0, 12).map((r: any) => item(r.media_type, r));
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
  return {
    ...item(type, d),
    overview: d.overview ?? "", tagline: d.tagline ?? "", genres: (d.genres ?? []).map((g: any) => g.name),
    runtime: (type === "movie" ? d.runtime : d.episode_run_time?.[0]) ?? null, status: d.status ?? "",
    crew: type === "tv" ? (d.created_by ?? []).map((p: any) => p.name) : (d.credits?.crew ?? []).filter((c: any) => c.job === "Director").map((c: any) => c.name),
    seasons: type === "tv" ? (d.seasons ?? []).filter((s: any) => s.season_number > 0).map((s: any) => ({ n: s.season_number, eps: s.episode_count })) : [],
    people, prov, collection: d.belongs_to_collection?.id ?? null,
    related: (d.recommendations?.results ?? []).slice(0, 8).map((r: any): Related => ({ ...item(type, r), rel: "Recommended" })),
  };
}

export async function getCollection(id: number): Promise<Related[]> {
  const d = await tmdb(`/collection/${id}`, {}, 24 * HOUR);
  return [...(d.parts ?? [])].sort((a: any, b: any) => (a.release_date || "9").localeCompare(b.release_date || "9")).map((r: any): Related => ({ ...item("movie", r), rel: "Same collection" }));
}

const BAD_ROLE = /\b(self|himself|herself|themselves|archive footage|uncredited)\b/i;
export async function getPerson(id: number): Promise<Person> {
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
  if (d.known_for_department === "Directing") for (const r of cc.crew ?? []) if (r.job === "Director") add(r, "Director");
  known.sort((a, b) => b.votes - a.votes);
  return { id: d.id, name: d.name, photo: d.profile_path ?? null, dept: d.known_for_department ?? "", bio: (d.biography ?? "").slice(0, 360), known: known.slice(0, 60) };
}

export async function getEpisode(tv: number, s: number, e: number) {
  const d = await tmdb(`/tv/${tv}/season/${s}/episode/${e}`, { append_to_response: "credits" }, 24 * HOUR);
  const map = (a: any[] = []): CastMember[] => a.map((p) => ({ id: p.id, name: p.name, photo: p.profile_path ?? null, role: p.character ?? "" }));
  return { name: (d.name ?? "") as string, cast: map(d.credits?.cast).slice(0, 12), guests: map(d.credits?.guest_stars).slice(0, 20) };
}

export async function getProviders(cc: string) {
  const [m, t] = await Promise.all([
    tmdb("/watch/providers/movie", { watch_region: cc }, 24 * HOUR),
    tmdb("/watch/providers/tv", { watch_region: cc }, 24 * HOUR),
  ]);
  const map = new Map<number, { id: number; name: string; pri: number }>();
  for (const d of [m, t]) for (const p of d.results ?? []) {
    const o = map.get(p.provider_id);
    if (!o || p.display_priority < o.pri) map.set(p.provider_id, { id: p.provider_id, name: p.provider_name, pri: p.display_priority });
  }
  return [...map.values()].sort((a, b) => a.pri - b.pri);
}
