"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, supabaseServer } from "@/lib/supabase/server";
import { normalizeDetails, type DetailId } from "@/lib/details";
import type { MediaType, Priority, Status } from "@/lib/types";
import type { LbEntry } from "@/lib/letterboxd-parse";
import { applyResolved, cleanUsername, fetchFeed, LbError, resolveEntries, syncLetterboxd } from "@/lib/letterboxd";

const STATUSES = ["watching", "partial", "watchlist", "watched"];
const where = (type: MediaType, id: number) => ({ tmdb_type: type, tmdb_id: id });
const done = () => revalidatePath("/", "layout");

export async function setStatus(item: { type: MediaType; id: number; title: string; year: string; poster: string | null }, status: Status | null, priority?: Priority) {
  const { sb, user } = await requireUser();
  if (status === null) {
    const { error } = await sb.from("library_items").delete().eq("user_id", user.id).match(where(item.type, item.id));
    if (error) throw new Error(error.message);
  } else {
    if (!STATUSES.includes(status)) throw new Error("Bad status");
    if (priority !== undefined && priority !== "someday" && priority !== "must") throw new Error("Bad priority");
    const { error } = await sb.from("library_items").upsert(
      { user_id: user.id, ...where(item.type, item.id), title: item.title, year: item.year, poster_path: item.poster, status, ...(priority ? { priority } : {}), ...(status === "watched" ? { watched_at: new Date().toISOString(), checked_at: null } : {}), updated_at: new Date().toISOString() },
      { onConflict: "user_id,tmdb_type,tmdb_id" },
    );
    if (error) throw new Error(error.message);
  }
  done();
}

type Row = { type: MediaType; id: number; title: string; year: string; poster: string | null };
const byType = (rows: Row[], t: MediaType) => rows.filter((r) => r.type === t).map((r) => r.id);

/** Mark many titles at once (the rest of a franchise). Meant for titles the user has not marked yet. */
export async function setStatusMany(items: Row[], status: Status) {
  if (!STATUSES.includes(status)) throw new Error("Bad status");
  const rows = items.slice(0, 100);
  if (!rows.length) return;
  const { sb, user } = await requireUser();
  const now = new Date().toISOString();
  const { error } = await sb.from("library_items").upsert(
    rows.map((r) => ({ user_id: user.id, ...where(r.type, r.id), title: r.title, year: r.year, poster_path: r.poster, status, ...(status === "watched" ? { watched_at: now } : {}), updated_at: now })),
    { onConflict: "user_id,tmdb_type,tmdb_id" },
  );
  if (error) throw new Error(error.message);
  done();
}

/** Undo for setStatusMany: removes only rows still holding that status with no rating, so nothing the user added since is lost. */
export async function undoStatusMany(items: Row[], status: Status) {
  const { sb, user } = await requireUser();
  for (const t of ["movie", "tv"] as MediaType[]) {
    const ids = byType(items.slice(0, 100), t);
    if (!ids.length) continue;
    const { error } = await sb.from("library_items").delete().eq("user_id", user.id).eq("tmdb_type", t).in("tmdb_id", ids).eq("status", status).eq("rating", 0);
    if (error) throw new Error(error.message);
  }
  done();
}

async function patch(type: MediaType, id: number, values: Record<string, unknown>) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("library_items").update({ ...values, updated_at: new Date().toISOString() }).eq("user_id", user.id).match(where(type, id));
  if (error) throw new Error(error.message);
}
export async function setPriority(type: MediaType, id: number, priority: Priority) {
  if (priority !== "someday" && priority !== "must") throw new Error("Bad priority");
  await patch(type, id, { priority }); done();
}
export async function setRating(type: MediaType, id: number, rating: number) {
  await patch(type, id, { rating: Math.max(0, Math.min(5, Math.round(rating))) }); done();
}
export async function setNote(type: MediaType, id: number, note: string) {
  await patch(type, id, { note: note.slice(0, 5000) });
}
export async function setProgress(type: MediaType, id: number, season: number, episode: number) {
  await patch(type, id, { progress_season: season, progress_episode: episode }); done();
}

export async function saveProfile(p: { country: string; services: number[]; serviceNames: Record<string, string> }) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("profiles").upsert(
    { user_id: user.id, country: p.country, services: p.services, service_names: p.serviceNames, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  done();
}

/** Save which title-page sections to show and in what order. Only touches detail_order, so it never overwrites country or services. */
export async function saveDetails(order: DetailId[]) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("profiles").upsert(
    { user_id: user.id, detail_order: normalizeDetails(order), updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  done();
}

/** Import one batch (max 25) of films parsed from a Letterboxd export or a text list. Opt-in: only called when the user imports in Setup. */
export async function importLetterboxd(entries: LbEntry[], last: boolean): Promise<{ added: number; updated: number; unmatched: string[] }> {
  const { sb, user } = await requireUser();
  const clean = entries.slice(0, 25).filter((e) => typeof e?.name === "string" && e.name && e.name.length < 300).map((e): LbEntry => ({
    name: e.name, tv: !!e.tv, year: Number.isInteger(e.year) ? e.year : null, watched: !!e.watched, watchlist: !!e.watchlist,
    rating: Number.isInteger(e.rating) ? Math.max(0, Math.min(5, e.rating)) : 0, date: typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
  })).filter((e) => e.watched || e.watchlist);
  const { rows, unmatched } = await resolveEntries(clean);
  const res = await applyResolved(sb, user.id, rows);
  if (last) done();
  return { ...res, unmatched };
}

type LbResult = { ok: true; added: number; updated: number } | { ok: false; error: string };

/** Save a Letterboxd username (after checking its public feed) and run the first sync. Opt-in. */
export async function connectLetterboxd(input: string): Promise<LbResult> {
  const { sb, user } = await requireUser();
  const name = cleanUsername(input);
  if (!name) return { ok: false, error: "That does not look like a Letterboxd username." };
  try { await fetchFeed(name); } catch (e) { return { ok: false, error: e instanceof LbError ? e.message : "Could not check that profile." }; }
  const { error } = await sb.from("profiles").upsert(
    { user_id: user.id, letterboxd_user: name, letterboxd_cursor: null, letterboxd_synced_at: null, letterboxd_error: null, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: error.message };
  const r = await syncLetterboxd(sb, user.id, true);
  done();
  return r.error ? { ok: false, error: r.error } : { ok: true, added: r.added, updated: r.updated };
}

export async function syncLetterboxdNow(): Promise<LbResult> {
  const { sb, user } = await requireUser();
  const r = await syncLetterboxd(sb, user.id, true);
  done();
  return r.error ? { ok: false, error: r.error } : { ok: true, added: r.added, updated: r.updated };
}

/** Stop syncing. Films already imported stay in the library. */
export async function disconnectLetterboxd() {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("profiles").update({ letterboxd_user: null, letterboxd_cursor: null, letterboxd_synced_at: null, letterboxd_error: null }).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  done();
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
