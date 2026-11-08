"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbError, userMessage } from "@/lib/errors";
import { requireUser, supabaseServer } from "@/lib/supabase/server";
import { normalizeDetails, type DetailId } from "@/lib/details";
import type { MediaType, Priority, Status } from "@/lib/types";
import { progressPassed } from "@/lib/new-episode";
import type { LbEntry } from "@/lib/letterboxd-parse";
import { applyResolved, cleanUsername, fetchFeed, LbError, resolveEntries, type Applied, type Failed, type Prev, type Unmatched, type Unsure, syncLetterboxd } from "@/lib/letterboxd";

const STATUSES = ["watching", "partial", "watchlist", "watched"];
const where = (type: MediaType, id: number) => ({ tmdb_type: type, tmdb_id: id });
/** Full refresh of every page. Only for bulk or settings changes: a quick mark must NOT call this (see "Marks and freshness" in CLAUDE.md). */
const done = () => revalidatePath("/", "layout");

/**
 * Drops the "New episode" flag. Best effort and separate from the main write: the columns come from migration 0008, and
 * until it is applied this errors harmlessly instead of breaking the change the user asked for.
 */
async function clearNewEp(sb: Awaited<ReturnType<typeof requireUser>>["sb"], userId: string, type: MediaType, id: number) {
  try { await sb.from("library_items").update({ new_episode_at: null, new_episode_s: null, new_episode_e: null, new_season: false }).eq("user_id", userId).match(where(type, id)).not("new_episode_at", "is", null); } catch { /* column not there yet */ }
}

type Single = { type: MediaType; id: number; title: string; year: string; poster: string | null };

/**
 * Quick mark: one database write and nothing else. No revalidation: LibProvider holds the truth on screen and refreshes the
 * server-rendered pages once, on the next navigation after a burst of marks.
 */
export async function setStatus(item: Single, status: Status | null, priority?: Priority) {
  await writeStatus(item, status, priority);
}

/** Same write, then a full refresh. For flows that show server data right away (import review). */
export async function setStatusFresh(item: Single, status: Status | null, priority?: Priority) {
  await writeStatus(item, status, priority);
  done();
}

async function writeStatus(item: Single, status: Status | null, priority?: Priority) {
  const { sb, user } = await requireUser();
  if (status === null) {
    const { error } = await sb.from("library_items").delete().eq("user_id", user.id).match(where(item.type, item.id));
    if (error) throw dbError(error);
  } else {
    if (!STATUSES.includes(status)) throw new Error("Bad status");
    if (priority !== undefined && priority !== "someday" && priority !== "must") throw new Error("Bad priority");
    const { error } = await sb.from("library_items").upsert(
      { user_id: user.id, ...where(item.type, item.id), title: item.title, year: item.year, poster_path: item.poster, status, ...(priority ? { priority } : {}), ...(status === "watched" ? { watched_at: new Date().toISOString(), checked_at: null } : {}), updated_at: new Date().toISOString() },
      { onConflict: "user_id,tmdb_type,tmdb_id" },
    );
    if (error) throw dbError(error);
    // Marked Watched again (or moved off Watching): the new episode is dealt with.
    if (status !== "watching") await clearNewEp(sb, user.id, item.type, item.id);
  }
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
  if (error) throw dbError(error);
  done();
}

/** Undo for setStatusMany: removes only rows still holding that status with no rating, so nothing the user added since is lost. */
export async function undoStatusMany(items: Row[], status: Status) {
  const { sb, user } = await requireUser();
  for (const t of ["movie", "tv"] as MediaType[]) {
    const ids = byType(items.slice(0, 100), t);
    if (!ids.length) continue;
    const { error } = await sb.from("library_items").delete().eq("user_id", user.id).eq("tmdb_type", t).in("tmdb_id", ids).eq("status", status).eq("rating", 0);
    if (error) throw dbError(error);
  }
  done();
}

async function patch(type: MediaType, id: number, values: Record<string, unknown>) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("library_items").update({ ...values, updated_at: new Date().toISOString() }).eq("user_id", user.id).match(where(type, id));
  if (error) throw dbError(error);
}
export async function setPriority(type: MediaType, id: number, priority: Priority) {
  if (priority !== "someday" && priority !== "must") throw new Error("Bad priority");
  await patch(type, id, { priority });
}
export async function setRating(type: MediaType, id: number, rating: number) {
  await patch(type, id, { rating: Math.max(0, Math.min(5, Math.round(rating))) });
}
export async function setNote(type: MediaType, id: number, note: string) {
  await patch(type, id, { note: note.slice(0, 5000) });
}
export async function setProgress(type: MediaType, id: number, season: number, episode: number) {
  await patch(type, id, { progress_season: season, progress_episode: episode });
  // Progress at or past the new episode settles the flag.
  const { sb, user } = await requireUser();
  const { data } = await sb.from("library_items").select("new_episode_s,new_episode_e").eq("user_id", user.id).match(where(type, id)).maybeSingle();
  if (data?.new_episode_s && progressPassed({ s: season, e: episode }, { s: data.new_episode_s, e: data.new_episode_e ?? 1 })) await clearNewEp(sb, user.id, type, id);
}

/**
 * "Watched up to here" on an episode (or its tick): saves the progress and makes sure the series is in the library. A series
 * that was only on the watchlist (or not there at all) becomes Watching; Watching, Partly watched and Watched stay as they are.
 * `episode` 0 clears the progress (unticking the very first episode). Progress past a "New episode" settles that badge.
 */
export async function setWatchedUpTo(item: { id: number; title: string; year: string; poster: string | null }, season: number, episode: number): Promise<Status> {
  if (!(season >= 0) || !(episode >= 0) || !Number.isInteger(season) || !Number.isInteger(episode)) throw new Error("Bad episode");
  const clear = episode === 0;
  const { sb, user } = await requireUser();
  const { data } = await sb.from("library_items").select("status").eq("user_id", user.id).match(where("tv", item.id)).maybeSingle();
  const keep = data?.status === "watching" || data?.status === "partial" || data?.status === "watched";
  const status: Status = keep ? (data!.status as Status) : "watching";
  const { error } = await sb.from("library_items").upsert(
    { user_id: user.id, ...where("tv", item.id), title: item.title, year: item.year, poster_path: item.poster, status, progress_season: clear ? null : season, progress_episode: clear ? null : episode, updated_at: new Date().toISOString() },
    { onConflict: "user_id,tmdb_type,tmdb_id" },
  );
  if (error) throw dbError(error);
  if (!clear) {
    const { data: ne } = await sb.from("library_items").select("new_episode_s,new_episode_e").eq("user_id", user.id).match(where("tv", item.id)).maybeSingle();
    if (ne?.new_episode_s && progressPassed({ s: season, e: episode }, { s: ne.new_episode_s, e: ne.new_episode_e ?? 1 })) await clearNewEp(sb, user.id, "tv", item.id);
  }
  done();
  return status;
}

export async function saveProfile(p: { country: string; services: number[]; serviceNames: Record<string, string> }) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("profiles").upsert(
    { user_id: user.id, country: p.country, services: p.services, service_names: p.serviceNames, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw dbError(error);
  done();
}

/** Save which title-page sections to show and in what order. Only touches detail_order, so it never overwrites country or services. */
export async function saveDetails(order: DetailId[]) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("profiles").upsert(
    { user_id: user.id, detail_order: normalizeDetails(order), updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw dbError(error);
  done();
}

/** Import one batch (max 25) of films parsed from a Letterboxd export or a text list. Opt-in: only called when the user imports in Setup. */
export async function importLetterboxd(entries: LbEntry[], last: boolean): Promise<{ added: number; updated: number; items: Applied[]; unmatched: Unmatched[]; unsure: Unsure[]; failed: Failed[] }> {
  const { sb, user } = await requireUser();
  const clean = entries.slice(0, 25).filter((e) => typeof e?.name === "string" && e.name && e.name.length < 300).map((e): LbEntry => ({
    name: e.name, tv: !!e.tv, watching: !!e.watching, year: Number.isInteger(e.year) ? e.year : null, watched: !!e.watched, watchlist: !!e.watchlist,
    rating: Number.isInteger(e.rating) ? Math.max(0, Math.min(5, e.rating)) : 0, date: typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
  })).filter((e) => e.watched || e.watchlist || e.watching);
  const { rows, unmatched, unsure, trace } = await resolveEntries(clean);
  let res: Awaited<ReturnType<typeof applyResolved>> = { added: 0, updated: 0, items: [], failed: [] }, failure: string | null = null, userFailure = "";
  try { res = await applyResolved(sb, user.id, rows); } catch (e) { failure = e instanceof Error ? e.message : String(e); userFailure = userMessage(e, "import"); }
  // Audit trail: one line in the Vercel runtime logs and one row in `import_log` (table migration 0007). Logging never breaks an import.
  const summary = { received: entries.length, kept: clean.length, added: res.added, updated: res.updated, items: res.items, unmatched, unsure, failed: res.failed, failure };
  console.log("[import]", JSON.stringify({ user: user.id, ...summary, trace }));
  try {
    const { error } = await sb.from("import_log").insert({ user_id: user.id, received: entries.length, kept: clean.length, added: res.added, updated: res.updated, unmatched: [...unmatched, ...unsure.map((u) => ({ label: u.label, unsure: u.guess.title }))], failure, trace: { lines: trace, applied: res.items, failed: res.failed } });
    if (error) console.error("[import] log insert failed:", error.message);
  } catch (e) { console.error("[import] log insert failed:", e); }
  if (failure) throw new Error(userFailure);
  if (last) done();
  return { ...res, unmatched, unsure };
}

/**
 * Add or change one title while fixing an import (retry, or a different match picked). Returns what was there before, so the
 * review's "Revert import" can undo it: `isNew` titles are removed on revert, others go back to `prev`.
 */
export async function addImported(item: { type: MediaType; id: number; title: string; year: string; poster: string | null }, status: Status, rating: number): Promise<{ isNew: boolean; prev?: Prev }> {
  if (!STATUSES.includes(status) || (item.type !== "movie" && item.type !== "tv") || !Number.isInteger(item.id)) throw new Error("Bad title");
  const { sb, user } = await requireUser();
  const { data, error: e0 } = await sb.from("library_items").select("status,rating,watched_at,checked_at").eq("user_id", user.id).match(where(item.type, item.id)).maybeSingle();
  if (e0) throw dbError(e0);
  const now = new Date().toISOString();
  const watched = status === "watched" && (!data || data.status !== "watched");
  const { error } = await sb.from("library_items").upsert(
    { user_id: user.id, ...where(item.type, item.id), title: item.title || "Untitled", year: item.year ?? "", poster_path: item.poster, status,
      ...(watched ? { watched_at: now, checked_at: null } : {}), ...(status === "watched" && rating > 0 && (!data || data.rating === 0) ? { rating: Math.min(5, Math.round(rating)) } : {}), updated_at: now },
    { onConflict: "user_id,tmdb_type,tmdb_id" },
  );
  if (error) throw dbError(error);
  done();
  return data ? { isNew: false, prev: { status: data.status, rating: data.rating, watched_at: data.watched_at ?? null, checked_at: data.checked_at ?? null } } : { isNew: true };
}

/**
 * Undo an import that stopped part way: titles it added are removed and titles it changed go back to how they were.
 * Takes what the import returned. Only rows owned by the signed-in user can be touched (RLS), and titles the import
 * merely found already in the library are left alone.
 */
export async function rollbackImport(items: Pick<Applied, "type" | "id" | "isNew" | "prev">[]): Promise<void> {
  const { sb, user } = await requireUser();
  const bad = (e: { message: string } | null) => { if (e) throw dbError(e, "rollbackImport"); };
  const list = items.slice(0, 5000).filter((a) => (a.type === "movie" || a.type === "tv") && Number.isInteger(a.id));
  for (const t of ["movie", "tv"] as MediaType[]) {
    const ids = list.filter((a) => a.isNew && a.type === t).map((a) => a.id);
    for (let i = 0; i < ids.length; i += 200) bad((await sb.from("library_items").delete().eq("user_id", user.id).eq("tmdb_type", t).in("tmdb_id", ids.slice(i, i + 200))).error);
  }
  for (const a of list) {
    if (a.isNew || !a.prev || !STATUSES.includes(a.prev.status)) continue;
    const { status, rating, watched_at, checked_at } = a.prev;
    bad((await sb.from("library_items").update({ status, rating, watched_at, checked_at, updated_at: new Date().toISOString() }).eq("user_id", user.id).match(where(a.type, a.id))).error);
  }
  done();
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
  if (error) { console.error("[error] saveLetterboxd:", error.message); return { ok: false, error: "Could not save that. Please try again." }; }
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
  if (error) throw dbError(error);
  done();
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
