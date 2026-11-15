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
