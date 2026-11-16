import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

/** Pure: true when an OMDb body says the call itself failed (daily limit, bad key), as opposed to "this title has no score". */
export function omdbFailed(d: unknown): boolean {
  const o = d as { Response?: string; Error?: string } | null;
  return !o || (o.Response === "False" && /limit|api key|unauthor/i.test(String(o.Error ?? "")));
}

const DAY = 86400000;
/** Pure: is a stored row still good? A score is kept 14 days (it barely moves); "OMDb has no score" is re-asked after 3. */
export function isFresh(row: { rating: number | null; fetchedAt: number }, now: number): boolean {
  return now - row.fetchedAt < (row.rating ? 14 : 3) * DAY;
}

// OMDb's free key is ~1000 calls a day. After a "limit reached" answer, stop asking for a while instead of burning requests that fail.
let pausedUntil = 0;
const pause = () => { pausedUntil = Date.now() + 15 * 60000; };

/** Throws when the call failed (timeout, HTTP error, limit, bad key); null means OMDb answered and has no score. */
async function fetchRating(imdb: string): Promise<ImdbRating | null> {
  const key = process.env.OMDB_API_KEY;
  if (!key) throw new Error("no OMDB_API_KEY");
  if (Date.now() < pausedUntil) throw new Error("omdb paused");
  const r = await fetch(`https://www.omdbapi.com/?i=${imdb}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
  const d = await r.json().catch(() => null);
  if (!r.ok || omdbFailed(d)) {
    const why = (d as { Error?: string } | null)?.Error ?? "";
    console.warn(`omdb rating failed: HTTP ${r.status} ${why}`);
    if (/limit/i.test(why)) pause();
    throw new Error("omdb failed");
  }
  return parseOmdb(d);
}

type Row = { rating: number | null; votes: number; fetchedAt: number };
let db: SupabaseClient | null | undefined;
function store(): SupabaseClient | null {
  if (db !== undefined) return db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  db = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return db;
}

async function readRows(ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>(), s = store();
  if (!s || !ids.length) return out;
  try {
    const { data, error } = await s.from("imdb_ratings").select("imdb_id,rating,votes,fetched_at").in("imdb_id", ids);
    if (error) { console.warn(`imdb_ratings read: ${error.message}`); return out; }
    for (const r of data ?? []) out.set(r.imdb_id, { rating: r.rating, votes: r.votes ?? 0, fetchedAt: Date.parse(r.fetched_at) });
  } catch (e) { console.warn(`imdb_ratings read: ${String(e)}`); }
  return out;
}

async function writeRow(id: string, r: ImdbRating | null) {
  const s = store();
  if (!s) return;
  try {
    const { error } = await s.from("imdb_ratings").upsert({ imdb_id: id, rating: r?.rating ?? null, votes: r?.votes ?? 0, fetched_at: new Date().toISOString() });
    if (error) console.warn(`imdb_ratings write: ${error.message}`);
  } catch (e) { console.warn(`imdb_ratings write: ${String(e)}`); }
}

const toRating = (r: Row | undefined): ImdbRating | null => (r && r.rating ? { rating: r.rating, votes: r.votes } : null);

/** IMDb scores for many ids at once: stored ones come from the database (one query), only missing or old ones go to OMDb. A failed OMDb call falls back to the old stored score. Never throws. */
export async function getImdbRatings(ids: (string | null | undefined)[]): Promise<Map<string, ImdbRating | null>> {
  const want = [...new Set(ids.filter((i): i is string => !!i && /^tt\d+$/.test(i)))];
  const out = new Map<string, ImdbRating | null>(), rows = await readRows(want), now = Date.now();
  const todo: string[] = [];
  for (const id of want) {
    const row = rows.get(id);
    if (row && isFresh(row, now)) out.set(id, toRating(row)); else todo.push(id);
  }
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(async (id) => {
      try { const r = await fetchRating(id); out.set(id, r); await writeRow(id, r); } catch { out.set(id, toRating(rows.get(id))); }
    }));
  }
  return out;
}

export async function getImdbRating(imdb: string | null | undefined): Promise<ImdbRating | null> {
  if (!imdb) return null;
  return (await getImdbRatings([imdb])).get(imdb) ?? null;
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
  if (Date.now() < pausedUntil) throw new Error("omdb paused");
  const r = await fetch(`https://www.omdbapi.com/?i=${imdb}&Season=${season}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
  const d = await r.json().catch(() => null);
  if (!r.ok || omdbFailed(d)) { console.warn(`omdb season failed: HTTP ${r.status}`); if (/limit/i.test(String((d as { Error?: string } | null)?.Error ?? ""))) pause(); throw new Error("omdb failed"); }
  return parseOmdbSeason(d);
}

const cs = unstable_cache(fetchSeason, ["imdb-season-v2"], { revalidate: 86400 });

/** IMDb scores for every episode of one season in ONE OMDb call. Never throws; empty means unknown. */
export async function getSeasonImdb(imdb: string | null | undefined, season: number): Promise<Record<number, number>> {
  if (!imdb || !/^tt\d+$/.test(imdb) || !Number.isInteger(season) || season < 0) return {};
  try { return await cs(imdb, season); } catch (e) {
    if (/incrementalCache missing/.test(String(e))) return fetchSeason(imdb, season).catch(() => ({}));
    return {};
  }
}
