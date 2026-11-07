import { cache } from "react";
import { supabaseServer } from "./supabase/server";
import type { LibItem, Profile } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toItem(r: any): LibItem {
  return {
    key: `${r.tmdb_type}:${r.tmdb_id}`, type: r.tmdb_type, id: r.tmdb_id, title: r.title, year: r.year ?? "", poster: r.poster_path ?? null,
    status: r.status, priority: r.priority === "must" ? "must" : "someday", rating: r.rating ?? 0, note: r.note ?? "",
    progress: r.progress_season ? { s: r.progress_season, e: r.progress_episode ?? 1 } : null,
    added: Date.parse(r.added_at) || 0,
  };
}

/** The signed-in user's library, newest first. Cached per request. */
export const getLibrary = cache(async (): Promise<LibItem[]> => {
  const sb = await supabaseServer();
  const { data } = await sb.from("library_items").select("*").order("added_at", { ascending: false });
  return (data ?? []).map(toItem);
});

export const getProfile = cache(async (): Promise<Profile> => {
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("*");
  const r: any = data?.[0];
  return { country: r?.country ?? "US", services: r?.services ?? [], serviceNames: r?.service_names ?? {} };
});
