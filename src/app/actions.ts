"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, supabaseServer } from "@/lib/supabase/server";
import { normalizeDetails, type DetailId } from "@/lib/details";
import type { MediaType, Priority, Status } from "@/lib/types";
import type { LbEntry } from "@/lib/letterboxd-parse";
import { applyResolved, cleanUsername, fetchFeed, LbError, resolveEntries, type Applied, type Failed, type Unmatched, syncLetterboxd } from "@/lib/letterboxd";

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
export async function importLetterboxd(entries: LbEntry[], last: boolean): Promise<{ added: number; updated: number; items: Applied[]; unmatched: Unmatched[]; failed: Failed[] }> {
  const { sb, user } = await requireUser();
  const clean = entries.slice(0, 25).filter((e) => typeof e?.name === "string" && e.name && e.name.length < 300).map((e): LbEntry => ({
    name: e.name, tv: !!e.tv, watching: !!e.watching, year: Number.isInteger(e.year) ? e.year : null, watched: !!e.watched, watchlist: !!e.watchlist,
    rating: Number.isInteger(e.rating) ? Math.max(0, Math.min(5, e.rating)) : 0, date: typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
  })).filter((e) => e.watched || e.watchlist || e.watching);
  const { rows, unmatched, trace } = await resolveEntries(clean);
  let res: Awaited<ReturnType<typeof applyResolved>> = { added: 0, updated: 0, items: [], failed: [] }, failure: string | null = null;
  try { res = await applyResolved(sb, user.id, rows); } catch (e) { failure = e instanceof Error ? e.message : String(e); }
  // Audit trail: one line in the Vercel runtime logs and one row in `import_log` (table migration 0007). Logging never breaks an import.
  const summary = { received: entries.length, kept: clean.length, added: res.added, updated: res.updated, items: res.items, unmatched, failed: res.failed, failure };
  console.log("[import]", JSON.stringify({ user: user.id, ...summary, trace }));
  try {
    const { error } = await sb.from("import_log").insert({ user_id: user.id, received: entries.length, kept: clean.length, added: res.added, updated: res.updated, unmatched, failure, trace: { lines: trace, applied: res.items, failed: res.failed } });
    if (error) console.error("[import] log insert failed:", error.message);
  } catch (e) { console.error("[import] log insert failed:", e); }
  if (failure) throw new Error(failure);
  if (last) done();
  return { ...res, unmatched };
}

/**
 * Undo an import that stopped part way: titles it added are removed and titles it changed go back to how they were.
 * Takes what the import returned. Only rows owned by the signed-in user can be touched (RLS), and titles the import
 * merely found already in the library are left alone.
 */
export async function rollbackImport(items: Applied[]): Promise<void> {
  const { sb, user } = await requireUser();
  const bad = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
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
