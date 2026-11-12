import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient;

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

/**
 * Titles the behaviour tests create themselves (mark from the popup, import a list). They are not part of SEED, so every test
 * starts from "not in the library". Each test removes what it made; setup and teardown also clear these ids as a backstop
 * after a crashed run. Nothing outside SEED and SCRATCH is ever read for deletion or deleted.
 */
export const SCRATCH = [
  { tmdb_type: "movie", tmdb_id: 27205, title: "Inception" },
  { tmdb_type: "movie", tmdb_id: 129, title: "Spirited Away" },
  /** Ended series used for the "New episode" test: seeded as Watched long before its episodes aired. */
  { tmdb_type: "tv", tmdb_id: 87108, title: "Chernobyl" },
  /** Used only by the "Next marks the episode you were on" test (Band of Brothers, 10 episodes): no other test reads or writes it. */
  { tmdb_type: "tv", tmdb_id: 4613, title: "Band of Brothers" },
] as const;

/** Deletes the smoke user's rows for the given titles (and only those). */
export async function deleteRows(sb: SB, userId: string, rows: readonly { tmdb_type: string; tmdb_id: number }[]) {
  for (const t of ["movie", "tv"] as const) {
    const ids = rows.filter((r) => r.tmdb_type === t).map((r) => r.tmdb_id);
    if (!ids.length) continue;
    const { error } = await sb.from("library_items").delete().eq("user_id", userId).eq("tmdb_type", t).in("tmdb_id", ids);
    if (error) throw new Error(`Smoke cleanup failed: ${error.message}`);
  }
}

/** The smoke user's saved row for one title, or null. */
export async function rowOf(sb: SB, userId: string, type: string, id: number) {
  const { data, error } = await sb.from("library_items").select("*").eq("user_id", userId).eq("tmdb_type", type).eq("tmdb_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { status: string; priority: string; rating: number; title: string; new_episode_at?: string | null } | null;
}

/** Signed-in tests can run: Supabase is configured and there is either the service-role key (a temporary account per run, account.ts)
 *  or the shared SMOKE_EMAIL/SMOKE_PASSWORD account. Does not depend on global setup having run (workers evaluate it while loading files). */
export function configured() {
  const base = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return base && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD));
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
