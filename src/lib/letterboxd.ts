/** Optional Letterboxd link. Server only. Nothing here runs unless the user imports an export or connects a username in Setup. */
import { tmdb } from "./tmdb";
import { parseFeed, type FeedEntry, type LbEntry } from "./letterboxd-parse";
import type { supabaseServer } from "./supabase/server";
import type { MediaType, Status } from "./types";

type Sb = Awaited<ReturnType<typeof supabaseServer>>;
const DAY_MS = 24 * 3600;
export const SYNC_EVERY_MS = 6 * 3600 * 1000;
export const USERNAME = /^[A-Za-z0-9_]{2,40}$/;

export class LbError extends Error {}

/** Accepts "name", "@name" or a letterboxd.com link. Returns null if it cannot be a username. */
export function cleanUsername(v: string): string | null {
  const s = v.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?letterboxd\.com\//i, "").replace(/\/.*$/, "");
  return USERNAME.test(s) ? s : null;
}

/** The member's public RSS feed (latest ~50 diary entries and reviews). Needs a public profile. */
export async function fetchFeed(user: string): Promise<FeedEntry[]> {
  let r: Response;
  try {
    r = await fetch(`https://letterboxd.com/${user}/rss/`, { headers: { "user-agent": "Typecast personal film tracker", accept: "application/rss+xml, text/xml" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  } catch { throw new LbError("Could not reach Letterboxd. Try again in a moment."); }
  if (r.status === 404) throw new LbError(`No public Letterboxd profile called "${user}".`);
  if (!r.ok) throw new LbError(`Letterboxd answered ${r.status}. Try again later.`);
  return parseFeed(await r.text());
}

/** A film or series ready to store, with what the user did with it. */
export interface Resolved { type: MediaType; id: number; title: string; year: string; poster: string | null; watched: boolean; watching?: boolean; rating: number; date: string | null; label?: string }
/** What the import did with one title, for the review list. `isNew` titles were added by this import. */
export interface Applied { label: string; type: MediaType; id: number; title: string; year: string; poster: string | null; rating: number; status: Status; isNew: boolean; prev?: Prev }
/** What an existing title looked like before the import changed it, so a failed import can put it back. */
export interface Prev { status: Status; rating: number; watched_at: string | null; checked_at: string | null }
/** A line that could not be matched on TMDB (`error` is set when the lookup itself failed rather than finding nothing). */
export interface Unmatched { label: string; status: Status; rating: number; error?: string }
/** A line that matched a title but could not be saved. Shown in the review so the user can retry or pick another title. */
export interface Failed { label: string; type: MediaType; id: number; title: string; year: string; poster: string | null; rating: number; status: Status; error: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
const yearOf = (r: any) => parseInt((r.release_date ?? "").slice(0, 4), 10);

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
/** Like `norm` but forgiving about sequels: "Part II", "II" and "2" are the same, "&" is "and", a leading "the" is ignored. Words stay joined. */
function normSeq(s: string): string {
  const w = s.toLowerCase().normalize("NFKD").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  if (w.length > 1 && w[0] === "the") w.shift();
  const last = w.length - 1;
  if (last > 0 && ROMAN[w[last]]) w[last] = ROMAN[w[last]];
  if (last > 0 && /^\d+$/.test(w[last]) && (w[last - 1] === "part" || w[last - 1] === "chapter")) w.splice(last - 1, 1);
  return w.join("");
}
const head = (t: string) => t.split(/\s*[:–—-]\s+/)[0];
/** Edit distance between two short strings. */
function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** The name without a trailing "1" or "2": a base to search when TMDB's own search does not find "Dead pool 2". */
const baseOf = (name: string): string | null => { const m = name.trim().match(/^(.{2,}?)\s+(\d{1,2}|[ivx]{1,4})$/i); return m ? m[1] : null; };

/**
 * How well a TMDB result matches the typed name: 3 same title (sequel numbers and "&" ignored), 2 same title before a subtitle
 * ("Dungeons & Dragons: Honor Among Thieves"), 1 a near miss (a typo), 0 no match. A trailing " 1" also matches the first film.
 */
function score(titles: (string | undefined)[], name: string): number {
  const wants = [normSeq(name)];
  const m = name.trim().match(/^(.{2,}?)\s+1$/);
  if (m) wants.push(normSeq(m[1]));
  const ts = titles.filter((t): t is string => !!t);
  if (ts.some((t) => wants.includes(normSeq(t)))) return 3;
  if (ts.some((t) => wants.includes(normSeq(head(t))))) return 2;
  // A typo only: the numbers must agree, so "Avatar 2" never settles for "Avatar".
  const nums = (x: string) => x.replace(/\D/g, "");
  const near = (a: string, b: string) => a.length >= 6 && b.length >= 6 && nums(a) === nums(b) && 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.85;
  return ts.some((t) => wants.some((w) => near(w, normSeq(t)) || near(w, normSeq(head(t))))) ? 1 : 0;
}
/** The best result for a name with its score (ties go to the more popular), or null when none is close enough. */
function best(res: any[], name: string, titles: (r: any) => (string | undefined)[], ok: (r: any) => boolean = () => true): { hit: any; s: number } | null {
  let out: { hit: any; s: number } | null = null;
  for (const r of res) {
    if (!ok(r)) continue;
    const s = score(titles(r), name);
    if (s && (!out || s > out.s || (s === out.s && (r.popularity ?? 0) > (out.hit.popularity ?? 0)))) out = { hit: r, s };
  }
  return out;
}
const movieTitles = (r: any) => [r.title, r.original_title];
const tvTitles = (r: any) => [r.name, r.original_name];

/** Find the TMDB film for a Letterboxd name and year (exports carry no TMDB id). Forgives sequel numbers, subtitles and small typos. */
async function findMovie(name: string, year: number | null): Promise<any | null> {
  const search = async (query: string, extra: Record<string, string>) => ((await tmdb("/search/movie", { query, include_adult: "false", ...extra }, DAY_MS)).results ?? []) as any[];
  if (year) {
    const a = await search(name, { year: String(year) });
    const hit = best(a, name, movieTitles)?.hit ?? a[0];
    if (hit) return hit;
  }
  let b = await search(name, {});
  const close = (r: any) => !year || Math.abs(yearOf(r) - year) <= 1;
  // TMDB's search often misses "Dead pool 2" or "Madagascar 3": search the base name and pick the numbered film from the results.
  const base = baseOf(name);
  if (base && best(b, name, movieTitles, close)?.s !== 3) b = [...b, ...(await search(base, {}))];
  return best(b, name, movieTitles, close)?.hit ?? null;
}

/** TV fallback for free-text lists, which can hold series too. Same forgiving match; a year can also settle for the first result. */
async function findTv(name: string, year: number | null): Promise<any | null> {
  const res = ((await tmdb("/search/tv", { query: name, include_adult: "false", ...(year ? { first_air_date_year: String(year) } : {}) }, DAY_MS)).results ?? []) as any[];
  return best(res, name, tvTitles)?.hit ?? (year ? res[0] ?? null : null);
}

const fields = (d: any) => ({ title: (d.title ?? d.name ?? "") as string, year: ((d.release_date ?? d.first_air_date ?? "") as string).slice(0, 4), poster: (d.poster_path ?? null) as string | null });

/** How one imported line was matched: the line as parsed, the movie and TV candidates TMDB gave, and which one was stored. Written to `import_log`. */
export interface TraceRow { input: string; asTv: boolean; watched: boolean; watching: boolean; watchlist: boolean; movie: Cand | null; tv: Cand | null; picked: MediaType | null; error?: string }
type Cand = { id: number; title: string; year: string };

/** Match export entries to TMDB. `unmatched` lists names that could not be found. */
export async function resolveEntries(entries: LbEntry[]): Promise<{ rows: Resolved[]; unmatched: Unmatched[]; trace: TraceRow[] }> {
  const rows: Resolved[] = [], unmatched: Unmatched[] = [], trace: TraceRow[] = [];
  await Promise.all(entries.map(async (e) => {
    const label = e.year ? `${e.name} (${e.year})` : e.name;
    try {
      const [mv, tvh] = await Promise.all([findMovie(e.name, e.year), e.tv ? findTv(e.name, e.year) : null]);
      const want = norm(e.name), ex = (h: any) => !!h && [h.title, h.original_title, h.name, h.original_name].some((n) => norm(n ?? "") === want);
      // A title can be both a film and a series ("Fargo", "Lost"): an exact match wins, then WIP (a series) , then the more popular one.
      const useTv = !!tvh && (!mv || (ex(tvh) !== ex(mv) ? ex(tvh) : e.watching || (tvh.popularity ?? 0) > (mv.popularity ?? 0)));
      const hit = useTv ? tvh : mv, type: MediaType = useTv ? "tv" : "movie";
      const cand = (h: any) => (h ? { id: h.id as number, title: (h.title ?? h.name ?? "") as string, year: ((h.release_date ?? h.first_air_date ?? "") as string).slice(0, 4) } : null);
      trace.push({ input: label, asTv: !!e.tv, watched: e.watched, watching: !!e.watching, watchlist: e.watchlist, movie: cand(mv), tv: cand(tvh), picked: hit ? type : null });
      if (!hit) { unmatched.push({ label, status: e.watched ? "watched" : e.watching ? "watching" : "watchlist", rating: e.rating }); return; }
      rows.push({ type, id: hit.id, ...fields(hit), watched: e.watched, watching: !!e.watching, rating: e.rating, date: e.date, label });
    } catch (err) {
      unmatched.push({ label, status: e.watched ? "watched" : e.watching ? "watching" : "watchlist", rating: e.rating, error: "Could not look this up on TMDB." });
      trace.push({ input: label, asTv: !!e.tv, watched: e.watched, watching: !!e.watching, watchlist: e.watchlist, movie: null, tv: null, picked: null, error: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  }));
  return { rows, unmatched, trace };
}

/**
 * Write Letterboxd data into the library without overwriting anything the user already has:
 * new titles are added; an existing title is only marked watched if it was not, and only given a rating if it had none.
 * A watchlist entry never touches a title that is already in the library.
 */
export async function applyResolved(sb: Sb, userId: string, input: Resolved[]): Promise<{ added: number; updated: number; items: Applied[]; failed: Failed[] }> {
  const merged = new Map<string, Resolved>();
  for (const r of input) {
    const k = `${r.type}:${r.id}`, o = merged.get(k);
    if (!o) merged.set(k, { ...r });
    else { o.watched ||= r.watched; o.watching = !o.watched && (o.watching || r.watching); o.rating = r.rating || o.rating; if (r.date && (!o.date || r.date > o.date)) o.date = r.date; }
  }
  const rows = [...merged.values()];
  if (!rows.length) return { added: 0, updated: 0, items: [], failed: [] };
  // Reading what exists is the only step that can stop the whole batch, and it happens before anything is written.
  const { data, error } = await sb.from("library_items").select("tmdb_type,tmdb_id,status,rating,watched_at,checked_at").eq("user_id", userId).in("tmdb_id", rows.map((r) => r.id));
  if (error) throw new Error(error.message);
  const have = new Map<string, Prev>((data ?? []).map((d: any) => [`${d.tmdb_type}:${d.tmdb_id}`, d]));
  const now = new Date().toISOString();
  const at = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toISOString() : now);
  const key = (r: Resolved) => `${r.type}:${r.id}`;
  const failedBy = new Map<string, string>();
  // Every row carries every column. A bulk upsert sends a column that only some rows have as null for the rest, which broke NOT NULL columns.
  const fresh = rows.filter((r) => !have.has(key(r))).map((r) => ({ r, row: {
    user_id: userId, tmdb_type: r.type, tmdb_id: r.id, title: r.title || "Untitled", year: r.year ?? "", poster_path: r.poster,
    status: r.watched ? "watched" : r.watching ? "watching" : "watchlist", rating: r.watched ? r.rating : 0,
    watched_at: r.watched ? at(r.date) : null, added_at: r.watched ? at(r.date) : now, updated_at: now,
  } }));
  const OPTS = { onConflict: "user_id,tmdb_type,tmdb_id", ignoreDuplicates: true } as const;
  if (fresh.length) {
    const { error: e } = await sb.from("library_items").upsert(fresh.map((f) => f.row), OPTS);
    if (e) {
      // A bulk insert is all or nothing. Retry one title at a time so a single bad row cannot take the others down with it.
      for (const f of fresh) {
        const { error: e1 } = await sb.from("library_items").upsert([f.row], OPTS);
        if (e1) failedBy.set(key(f.r), e1.message);
      }
    }
  }
  let updated = 0;
  const finalStatus = new Map<string, string>(), changed = new Set<string>();
  await Promise.all(rows.filter((r) => (r.watched || r.watching) && have.has(key(r))).map(async (r) => {
    const cur = have.get(key(r))!;
    const patch: Record<string, unknown> = {};
    if (!r.watched) { if (cur.status === "watchlist") patch.status = "watching"; }
    else if (cur.status !== "watched") Object.assign(patch, { status: "watched", watched_at: at(r.date), checked_at: null });
    if (r.watched && cur.rating === 0 && r.rating > 0) patch.rating = r.rating;
    if (!Object.keys(patch).length) return;
    const { error: e } = await sb.from("library_items").update({ ...patch, updated_at: now }).eq("user_id", userId).eq("tmdb_type", r.type).eq("tmdb_id", r.id);
    if (e) { failedBy.set(key(r), e.message); return; }
    if (typeof patch.status === "string") finalStatus.set(key(r), patch.status);
    changed.add(key(r));
    updated++;
  }));
  const items: Applied[] = [], failed: Failed[] = [];
  for (const r of rows) {
    const k = key(r), isNew = !have.has(k), base = { label: r.label ?? r.title, type: r.type, id: r.id, title: r.title, year: r.year, poster: r.poster, rating: r.rating };
    const wanted = (r.watched ? "watched" : r.watching ? "watching" : "watchlist") as Status;
    if (failedBy.has(k)) { failed.push({ ...base, status: wanted, error: failedBy.get(k)!.slice(0, 200) }); continue; }
    const prev = have.get(k);
    items.push({ ...base, isNew, status: (isNew ? wanted : finalStatus.get(k) ?? prev!.status) as Status,
      ...(changed.has(k) ? { prev: { status: prev!.status, rating: prev!.rating, watched_at: prev!.watched_at ?? null, checked_at: prev!.checked_at ?? null } } : {}) });
  }
  return { added: fresh.filter((f) => !failedBy.has(key(f.r))).length, updated, items, failed };
}

export interface SyncResult { added: number; updated: number; seen: number; error?: string }

/**
 * Pull new diary entries from the connected member's feed. Does nothing when no username is saved, or (unless `force`)
 * when the last check was under six hours ago. Only entries newer than the stored cursor are read, except on the first
 * run, so a film you remove later is not brought back.
 */
export async function syncLetterboxd(sb: Sb, userId: string, force = false): Promise<SyncResult> {
  const none: SyncResult = { added: 0, updated: 0, seen: 0 };
  const { data } = await sb.from("profiles").select("letterboxd_user,letterboxd_synced_at,letterboxd_cursor").eq("user_id", userId).maybeSingle();
  const user: string | null = data?.letterboxd_user ?? null;
  if (!user) return none;
  const last = data?.letterboxd_synced_at ? Date.parse(data.letterboxd_synced_at) : 0;
  if (!force && Date.now() - last < SYNC_EVERY_MS) return none;
  const cursor = data?.letterboxd_cursor ? Date.parse(data.letterboxd_cursor) : null;
  const save = (v: Record<string, unknown>) => sb.from("profiles").update(v).eq("user_id", userId);
  try {
    const fresh = (await fetchFeed(user)).filter((e) => cursor === null || e.pub > cursor);
    let failed = false;
    const rows: Resolved[] = [];
    await Promise.all(fresh.map(async (e) => {
      try { rows.push({ type: e.type, id: e.id, ...fields(await tmdb(`/${e.type}/${e.id}`, {}, DAY_MS)), watched: true, rating: e.rating, date: e.watched ?? new Date(e.pub).toISOString().slice(0, 10) }); }
      catch { failed = true; }
    }));
    const res = await applyResolved(sb, userId, rows);
    if (res.failed.length) failed = true; // do not move the cursor past entries that were not saved: the next sync tries them again
    const newest = fresh.reduce((m, e) => Math.max(m, e.pub), cursor ?? 0);
    await save({ letterboxd_synced_at: new Date().toISOString(), letterboxd_error: null, ...(failed || !newest ? {} : { letterboxd_cursor: new Date(newest).toISOString() }) });
    return { ...res, seen: fresh.length };
  } catch (e) {
    const msg = e instanceof LbError ? e.message : "Sync failed. It will try again later.";
    await save({ letterboxd_synced_at: new Date().toISOString(), letterboxd_error: msg });
    return { ...none, error: msg };
  }
}
