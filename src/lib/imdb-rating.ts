import { unstable_cache } from "next/cache";

/** IMDb's own score for one title or episode, via OMDb (needs OMDB_API_KEY). Never throws: null means "unknown". */
export interface ImdbRating { rating: number; votes: number }

/** Pure: pick the rating out of an OMDb JSON body. */
export function parseOmdb(d: unknown): ImdbRating | null {
  const o = d as { Response?: string; imdbRating?: string; imdbVotes?: string } | null;
  if (!o || o.Response === "False") return null;
  const rating = Number(o.imdbRating);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  const votes = Number(String(o.imdbVotes ?? "").replace(/,/g, ""));
  return { rating, votes: Number.isFinite(votes) ? votes : 0 };
}

async function fetchRating(imdb: string): Promise<ImdbRating | null> {
  const key = process.env.OMDB_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://www.omdbapi.com/?i=${imdb}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return null;
  return parseOmdb(await r.json());
}

const c = unstable_cache(async (imdb: string) => fetchRating(imdb).catch(() => null), ["imdb-rating-v1"], { revalidate: 86400 });

export async function getImdbRating(imdb: string | null | undefined): Promise<ImdbRating | null> {
  if (!imdb || !/^tt\d+$/.test(imdb)) return null;
  try { return await c(imdb); } catch (e) {
    if (/incrementalCache missing/.test(String(e))) return fetchRating(imdb).catch(() => null);
    return null;
  }
}

/** Pure: episode number -> IMDb score out of OMDb's season body. */
export function parseOmdbSeason(d: unknown): Record<number, number> {
  const o = d as { Response?: string; Episodes?: { Episode?: string; imdbRating?: string }[] } | null;
  const out: Record<number, number> = {};
  if (!o || o.Response === "False") return out;
  for (const x of o.Episodes ?? []) {
    const e = Number(x.Episode), r = Number(x.imdbRating);
    if (Number.isInteger(e) && Number.isFinite(r) && r > 0) out[e] = r;
  }
  return out;
}

async function fetchSeason(imdb: string, season: number): Promise<Record<number, number>> {
  const key = process.env.OMDB_API_KEY;
  if (!key) return {};
  const r = await fetch(`https://www.omdbapi.com/?i=${imdb}&Season=${season}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
  return r.ok ? parseOmdbSeason(await r.json()) : {};
}

const cs = unstable_cache(async (imdb: string, season: number) => fetchSeason(imdb, season).catch(() => ({})), ["imdb-season-v1"], { revalidate: 86400 });

/** IMDb scores for every episode of one season in ONE OMDb call. Never throws; empty means unknown. */
export async function getSeasonImdb(imdb: string | null | undefined, season: number): Promise<Record<number, number>> {
  if (!imdb || !/^tt\d+$/.test(imdb) || !Number.isInteger(season) || season < 0) return {};
  try { return await cs(imdb, season); } catch (e) {
    if (/incrementalCache missing/.test(String(e))) return fetchSeason(imdb, season).catch(() => ({}));
    return {};
  }
}
