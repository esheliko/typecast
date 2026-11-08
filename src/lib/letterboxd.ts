/** Optional Letterboxd link. Server only. Nothing here runs unless the user imports an export or connects a username in Setup. */
import { search, tmdb } from "./tmdb";
import { parseFeed, type FeedEntry, type LbEntry } from "./letterboxd-parse";
import type { supabaseServer } from "./supabase/server";
import type { BrowseItem, MediaType, SearchHit, Status } from "./types";

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
/** A line matched with low confidence. Nothing is saved until the user approves `guess` or picks one of `alts` in the review. */
export interface Unsure { label: string; status: Status; rating: number; why: string; /** The guess looks unrelated to what was typed (excluded from "add all"). */ weak?: boolean; guess: BrowseItem; alts: BrowseItem[] }
/** A line that matched a title but could not be saved. Shown in the review so the user can retry or pick another title. */
export interface Failed { label: string; type: MediaType; id: number; title: string; year: string; poster: string | null; rating: number; status: Status; error: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
const yearOf = (r: any) => parseInt((r.release_date ?? "").slice(0, 4), 10);

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
/** Like `norm` but forgiving about sequels: "Part II", "II" and "2" are the same, "&" is "and", a leading "the" is ignored. Words stay joined. */
function normSeq(s: string): string {
  const w = s.toLowerCase().normalize("NFKD").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  if (w.length > 1 && w[0] === "the") w.shift();
  const keep = w.filter((x) => x !== "and");
  if (keep.length) w.splice(0, w.length, ...keep);
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
/** How well known a result is. Vote count is steadier than TMDB's popularity, which swings with what was released lately. */
const fame = (h: any) => (h?.vote_count ?? 0) as number;
type Found = { hit: any; s: number; rival: any | null; near: any | null };
/**
 * The best result for a name with its score (ties go to the better known), or null when none is close enough.
 * `rival` is the strongest other result of the same score (the name is ambiguous); `near` is a much better known title that is only a typo away.
 */
function best(res: any[], name: string, titles: (r: any) => (string | undefined)[], ok: (r: any) => boolean = () => true): Found | null {
  const scored: { hit: any; s: number }[] = [];
  for (const r of res) {
    if (!ok(r)) continue;
    const s = score(titles(r), name);
    if (s) scored.push({ hit: r, s });
  }
  scored.sort((a, b) => b.s - a.s || fame(b.hit) - fame(a.hit));
  const top = scored[0];
  if (!top) return null;
  const near = top.s > 1 ? scored.find((x) => x.s === 1 && fame(x.hit) >= 5 * Math.max(fame(top.hit), 20))?.hit ?? null : null;
  return { ...top, rival: scored.find((x) => x !== top && x.s === top.s)?.hit ?? null, near };
}
const movieTitles = (r: any) => [r.title, r.original_title];
const tvTitles = (r: any) => [r.name, r.original_name];

/** Find the TMDB film for a Letterboxd name and year (exports carry no TMDB id). Forgives sequel numbers, subtitles and small typos. */
async function findMovie(name: string, year: number | null): Promise<Found | null> {
  const search = async (query: string, extra: Record<string, string>) => ((await tmdb("/search/movie", { query, include_adult: "false", ...extra }, DAY_MS)).results ?? []) as any[];
  if (year) {
    const a = await search(name, { year: String(year) });
    const hit = best(a, name, movieTitles) ?? (a[0] ? { hit: a[0], s: 0, rival: null, near: null } : null);
    if (hit) return hit;
  }
  let b = await search(name, {});
  const close = (r: any) => !year || Math.abs(yearOf(r) - year) <= 1;
  // TMDB's search often misses "Dead pool 2" or "Madagascar 3": search the base name and pick the numbered film from the results.
  const base = baseOf(name);
  if (base && best(b, name, movieTitles, close)?.s !== 3) b = [...b, ...(await search(base, {}))];
  return best(b, name, movieTitles, close);
}

/** TV fallback for free-text lists, which can hold series too. Same forgiving match; a year can also settle for the first result. */
async function findTv(name: string, year: number | null): Promise<Found | null> {
  const res = ((await tmdb("/search/tv", { query: name, include_adult: "false", ...(year ? { first_air_date_year: String(year) } : {}) }, DAY_MS)).results ?? []) as any[];
  return best(res, name, tvTitles) ?? (year && res[0] ? { hit: res[0], s: 0, rival: null, near: null } : null);
}

const fields = (d: any) => ({ title: (d.title ?? d.name ?? "") as string, year: ((d.release_date ?? d.first_air_date ?? "") as string).slice(0, 4), poster: (d.poster_path ?? null) as string | null });

/** How one imported line was matched: the line as parsed, the movie and TV candidates TMDB gave, and which one was stored. Written to `import_log`. */
export interface TraceRow { input: string; asTv: boolean; watched: boolean; watching: boolean; watchlist: boolean; movie: Cand | null; tv: Cand | null; picked: MediaType | null; error?: string }
type Cand = { id: number; title: string; year: string };

/** 0 to 1: how alike a typed name and a title are (one containing the other counts as close). */
function sim(a: string, b: string): number {
  const x = normSeq(a), y = normSeq(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return 0.9;
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}
/** For a name TMDB's search finds nothing for (a typo: "Erin brokovich"): search its longest words alone and keep the titles that look most like the whole name. */
async function looseSearch(name: string): Promise<SearchHit[]> {
  const words = [...new Set(name.split(/[\s\p{P}]+/u).filter((w) => w.length >= 3))].sort((a, b) => b.length - a.length).slice(0, 2);
  const pools = await Promise.all(words.map((w) => search(w, "title").catch(() => [] as SearchHit[])));
  const seen = new Set<string>();
  return pools.flat().filter((h) => h.kind === "title" && !seen.has(h.key) && !!seen.add(h.key))
    .map((h) => ({ h, r: sim(name, (h as { title: string }).title) })).filter((x) => x.r >= 0.55).sort((a, b) => b.r - a.r).slice(0, 5).map((x) => x.h);
}
const ALIASES: Record<string, string> = { got: "Game of Thrones", lotr: "The Lord of the Rings", htgawm: "How to Get Away with Murder", tbbt: "The Big Bang Theory" };
/** The part of a line worth searching: a note in another script after the title ("Bojack horseman לא") is dropped, and common abbreviations are spelled out. */
function searchName(name: string): string {
  const alias = ALIASES[name.trim().toLowerCase()];
  if (alias) return alias;
  const mixed = /\p{Script=Latin}/u.test(name) && /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s\p{M}]/u.test(name);
  if (!mixed) return name;
  const latin = name.replace(/[^\p{Script=Latin}\p{N}\p{P}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  return latin || name;
}
const asItem = (type: MediaType, h: any): BrowseItem => ({ key: `${type}:${h.id}`, type, id: h.id, ...fields(h), rating: 0 });

/** Match export entries to TMDB. `unmatched` lists names nothing was found for; `unsure` names a best guess to confirm before it is saved. */
export async function resolveEntries(entries: LbEntry[]): Promise<{ rows: Resolved[]; unmatched: Unmatched[]; unsure: Unsure[]; trace: TraceRow[] }> {
  const rows: Resolved[] = [], unmatched: Unmatched[] = [], unsure: Unsure[] = [], trace: TraceRow[] = [];
  await Promise.all(entries.map(async (e) => {
    const label = e.year ? `${e.name} (${e.year})` : e.name;
    const status: Status = e.watched ? "watched" : e.watching ? "watching" : "watchlist";
    try {
      const q = searchName(e.name);
      const [mv, tvh] = await Promise.all([findMovie(q, e.year), e.tv ? findTv(q, e.year) : null]);
      // A title can be both a film and a series ("Fargo", "Lost"): an exact match wins, then WIP (a series), then the better known one.
      const ex = (f: Found | null) => f?.s === 3;
      const useTv = !!tvh && (!mv || (ex(tvh) !== ex(mv) ? ex(tvh) : e.watching || fame(tvh.hit) > fame(mv.hit)));
      const pick = useTv ? tvh : mv, other = useTv ? mv : tvh, type: MediaType = useTv ? "tv" : "movie";
      const cand = (h: any) => (h ? { id: h.id as number, title: (h.title ?? h.name ?? "") as string, year: ((h.release_date ?? h.first_air_date ?? "") as string).slice(0, 4) } : null);
      trace.push({ input: label, asTv: !!e.tv, watched: e.watched, watching: !!e.watching, watchlist: e.watchlist, movie: cand(mv?.hit), tv: cand(tvh?.hit), picked: pick ? type : null });

      // How sure are we? Sure = the same title, and nothing else of that name is about as well known (the other kind, or another film or series).
      let why = "";
      if (pick) {
        const date = (pick.hit.release_date ?? pick.hit.first_air_date ?? "") as string;
        const exact = pick.s === 3 || (pick.s === 2 && (!!e.year || !pick.rival));
        const otherClash = !!other && ex(other) && pick.s === 3 && !(e.year || (useTv && e.watching) || fame(pick.hit) >= 4 * fame(other.hit));
        const rivalClash = !!pick.rival && !e.year && fame(pick.rival) * 2.5 >= fame(pick.hit);
        if (pick.near) why = "Spelled a little differently from a much better known title.";
        else if (!exact) why = pick.s === 2 ? "The title only partly matches." : "The spelling is a little different.";
        else if (e.watching && type === "movie") why = "Marked as watching, which fits a series better.";
        else if (otherClash) why = useTv ? "There is a film with the same name." : "There is a series with the same name.";
        else if (rivalClash) why = "Several titles share this name.";
        else if (!e.year && date > new Date().toISOString().slice(0, 10)) why = "This one is not out yet.";
      }
      if (pick && !why) { rows.push({ type, id: pick.hit.id, ...fields(pick.hit), watched: e.watched, watching: !!e.watching, rating: e.rating, date: e.date, label }); return; }

      // Not sure, or not found by the strict match: ask the same search the "Find it" box uses, so its first result is never missed.
      let found = await search(q, "title").catch(() => []);
      if (!pick && !found.length) found = await looseSearch(q);
      const hits = found.filter((h): h is Extract<typeof h, { kind: "title" }> => h.kind === "title").map((h) => { const { kind, ...rest } = h; void kind; return { ...rest, rating: 0 } as BrowseItem; });
      // A series that is marked as watching: prefer the first series the search finds over a film of that name.
      const seriesFirst = e.watching && type === "movie" ? hits.find((h) => h.type === "tv") : undefined;
      const first: BrowseItem | null = seriesFirst ?? (pick?.near ? asItem(type, pick.near) : pick ? asItem(type, pick.hit) : hits[0] ?? null);
      if (!first) { unmatched.push({ label, status, rating: e.rating }); return; }
      const alts: BrowseItem[] = [];
      for (const c of [pick && first.key !== `${type}:${pick.hit.id}` ? asItem(type, pick.hit) : null, other ? asItem(useTv ? "movie" : "tv", other.hit) : null, pick?.rival ? asItem(type, pick.rival) : null, ...hits]) {
        if (c && c.key !== first.key && !alts.some((a) => a.key === c.key)) alts.push(c);
      }
      const weak = !pick && sim(q, first.title) < 0.5;
      unsure.push({ label, status, rating: e.rating, why: weak ? "Nothing close; this is only the nearest search result." : why || "Best guess from search.", ...(weak ? { weak } : {}), guess: first, alts: alts.slice(0, 4) });
    } catch (err) {
      unmatched.push({ label, status, rating: e.rating, error: "Could not look this up on TMDB." });
      trace.push({ input: label, asTv: !!e.tv, watched: e.watched, watching: !!e.watching, watchlist: e.watchlist, movie: null, tv: null, picked: null, error: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  }));
  return { rows, unmatched, unsure, trace };
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
