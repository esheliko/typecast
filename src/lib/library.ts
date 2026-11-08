import { cache } from "react";
import { supabaseServer } from "./supabase/server";
import { normalizeDetails } from "./details";
import { getLastAired } from "./tmdb";
import { syncLetterboxd } from "./letterboxd";
import { fetchAll } from "./paginate";
import type { LibItem, Profile } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toItem(r: any): LibItem & { checkedAt: number } {
  return {
    key: `${r.tmdb_type}:${r.tmdb_id}`, type: r.tmdb_type, id: r.tmdb_id, title: r.title, year: r.year ?? "", poster: r.poster_path ?? null,
    status: r.status, priority: r.priority === "must" ? "must" : "someday", rating: r.rating ?? 0, note: r.note ?? "",
    progress: r.progress_season ? { s: r.progress_season, e: r.progress_episode ?? 1 } : null,
    added: Date.parse(r.added_at) || 0,
    watchedAt: r.watched_at ? Date.parse(r.watched_at) : null,
    checkedAt: r.checked_at ? Date.parse(r.checked_at) : 0,
  };
}

/** The signed-in user's rows, newest first, with the bookkeeping the new-episode check needs. Cached per request. */
const getLibraryRaw = cache(async () => {
  const sb = await supabaseServer();
  // Paged: one request returns at most the project's max_rows (1000 by default). The tie-breakers make the order total so pages never overlap.
  const rows = await fetchAll<any>((from, to) => sb.from("library_items").select("*")
    .order("added_at", { ascending: false }).order("tmdb_type").order("tmdb_id").range(from, to));
  return rows.map(toItem);
});

/** The signed-in user's library, newest first. Cached per request. Never waits on TMDB: the new-episode check runs separately (see recheckEpisodes). */
export const getLibrary = cache(async (): Promise<LibItem[]> => {
  const items = await getLibraryRaw();
  return items.map((it) => {
    const out: LibItem & { checkedAt?: number } = { ...it };
    delete out.checkedAt;
    return out;
  });
});

/**
 * Moves watched series with a newer episode back to "To watch". Runs behind a Suspense boundary after the page has been
 * sent, so it never delays what you see. Returns true when something moved, so the page can refresh itself.
 */
export async function recheckEpisodes(): Promise<boolean> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  // The Letterboxd check is opt-in: it returns at once unless a username is saved, and runs at most every six hours.
  const [moved, lb] = await Promise.all([
    returnNewEpisodes(sb, await getLibraryRaw()),
    uid ? syncLetterboxd(sb, uid).catch(() => null) : null,
  ]);
  return moved.size > 0 || (lb?.added ?? 0) + (lb?.updated ?? 0) > 0;
}

const RECHECK_MS = 12 * 3600 * 1000;
const MAX_CHECKS = 20;

/** Watched series with an episode aired after the day they were marked go back to "To watch". Returns the keys moved. */
async function returnNewEpisodes(sb: Awaited<ReturnType<typeof supabaseServer>>, items: (LibItem & { checkedAt: number })[]): Promise<Set<string>> {
  const moved = new Set<string>();
  const now = Date.now();
  const due = items.filter((i) => i.type === "tv" && i.status === "watched" && i.watchedAt && now - i.checkedAt > RECHECK_MS).slice(0, MAX_CHECKS);
  await Promise.all(due.map(async (i) => {
    try {
      const aired = await getLastAired(i.id);
      const fresh = !!aired && aired > new Date(i.watchedAt!).toISOString().slice(0, 10);
      const { error } = await sb.from("library_items").update(fresh ? { status: "watchlist", checked_at: new Date().toISOString() } : { checked_at: new Date().toISOString() }).eq("tmdb_type", "tv").eq("tmdb_id", i.id).eq("status", "watched");
      if (!error && fresh) moved.add(i.key);
    } catch { /* TMDB hiccup: try again next visit */ }
  }));
  return moved;
}

export const getProfile = cache(async (): Promise<Profile> => {
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("*");
  const r: any = data?.[0];
  return { country: r?.country ?? "US", services: r?.services ?? [], serviceNames: r?.service_names ?? {}, details: normalizeDetails(r?.detail_order),
    letterboxd: r?.letterboxd_user ? { user: r.letterboxd_user, syncedAt: r.letterboxd_synced_at ? Date.parse(r.letterboxd_synced_at) : null, error: r.letterboxd_error ?? null } : null };
});
