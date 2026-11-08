import { createClient } from "@supabase/supabase-js";

/** Titles the smoke user is given. Real TMDB ids, so title pages and suggestions have something to show. One row per status/priority/type. */
export const SEED = [
  { tmdb_type: "movie", tmdb_id: 603, title: "The Matrix", year: "1999", poster_path: null, status: "watched", priority: "someday", rating: 5 },
  { tmdb_type: "movie", tmdb_id: 550, title: "Fight Club", year: "1999", poster_path: null, status: "watched", priority: "someday", rating: 0 },
  { tmdb_type: "movie", tmdb_id: 680, title: "Pulp Fiction", year: "1994", poster_path: null, status: "watchlist", priority: "must", rating: 0 },
  { tmdb_type: "movie", tmdb_id: 13, title: "Forrest Gump", year: "1994", poster_path: null, status: "watchlist", priority: "someday", rating: 0 },
  { tmdb_type: "movie", tmdb_id: 155, title: "The Dark Knight", year: "2008", poster_path: null, status: "partial", priority: "someday", rating: 0 },
  { tmdb_type: "tv", tmdb_id: 1396, title: "Breaking Bad", year: "2008", poster_path: null, status: "watching", priority: "someday", rating: 0, progress_season: 2, progress_episode: 3 },
  { tmdb_type: "tv", tmdb_id: 1399, title: "Game of Thrones", year: "2011", poster_path: null, status: "watched", priority: "someday", rating: 4 },
  { tmdb_type: "tv", tmdb_id: 66732, title: "Stranger Things", year: "2016", poster_path: null, status: "watchlist", priority: "someday", rating: 0 },
] as const;

export function configured() {
  return Boolean(process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Signed-in Supabase client for the smoke user. Refuses anything that does not look like a dedicated test account. */
export async function smokeClient() {
  const email = process.env.SMOKE_EMAIL!;
  if (!/smoke|test/i.test(email)) throw new Error(`SMOKE_EMAIL must be a dedicated test account (its address must contain "smoke" or "test"); got ${email}`);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: process.env.SMOKE_PASSWORD! });
  if (error || !data.user) throw new Error(`Smoke user cannot sign in: ${error?.message}`);
  return { sb, userId: data.user.id };
}
