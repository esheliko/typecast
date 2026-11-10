/** Optional Letterboxd link. Server only. Nothing here runs unless the user imports an export or connects a username in Setup. */
import { search, tmdb } from "./tmdb";
import { suggestSpelling } from "./spell";
import { dayIn } from "./today";
import { baseOf, charSim, isLiteral, normSeq, sameNumbers, score, sim, splitQualifier, startsWithWords, trailingNumber, variants } from "./title-match";
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
export interface Unsure { label: string; status: Status; rating: number; why: string; /** The guess looks unrelated to what was typed (excluded from "add all"). */ weak?: boolean; /** Not a clear favourite: excluded from "add all". */ risky?: boolean; guess: BrowseItem; alts: BrowseItem[] }
/** A line that matched a title but could not be saved. Shown in the review so the user can retry or pick another title. */
export interface Failed { label: string; type: MediaType; id: number; title: string; year: string; poster: string | null; rating: number; status: Status; error: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
const yearOf = (r: any) => parseInt((r.release_date ?? "").slice(0, 4), 10);

/** How well known a result is. Vote count is steadier than TMDB's popularity, which swings with what was released lately. */
const fame = (h: any) => (h?.vote_count ?? 0) as number;
type Found = { all: { hit: any; s: number; lit?: boolean }[] };
/** Every result close enough to the name, with its score (3 same title, 2 same before a subtitle, 1 a typo away). */
function best(res: any[], name: string, titles: (r: any) => (string | undefined)[], ok: (r: any) => boolean = () => true): Found | null {
  const all: { hit: any; s: number; lit?: boolean }[] = [];
  for (const r of res) {
    if (!ok(r)) continue;
    const s = score(titles(r), name);
    if (s) all.push({ hit: r, s, lit: s === 3 && isLiteral(titles(r), name) });
  }
  return all.length ? { all } : null;
}
const movieTitles = (r: any) => [r.title, r.original_title];
const tvTitles = (r: any) => [r.name, r.original_name];
/** A plain, widely known exact title: nothing else needs searching for. */
const settled = (f: Found | null) => !!f?.all.some((x) => x.s === 3 && fame(x.hit) >= 5000);

/** Find the TMDB film for a Letterboxd name and year (exports carry no TMDB id). Forgives sequel numbers, subtitles, run-together words and small typos. */
async function findMovie(name: string, year: number | null): Promise<Found | null> {
  const search = async (query: string, extra: Record<string, string>) => ((await tmdb("/search/movie", { query, include_adult: "false", ...extra }, DAY_MS)).results ?? []) as any[];
  if (year) {
    const a = await search(name, { year: String(year) });
    // With a year, TMDB's first result for that year is accepted even when the title is not close.
    const hit = best(a, name, movieTitles) ?? (a[0] ? { all: [{ hit: a[0], s: 2 }] } : null);
    if (hit) return hit;
  }
  let b = await search(name, {});
  const close = (r: any) => !year || Math.abs(yearOf(r) - year) <= 1;
  // TMDB's search often misses "Dead pool 2" or "Madagascar 3": search the base name and pick the numbered film from the results.
  const base = baseOf(name);
  if (base && !best(b, name, movieTitles, close)?.all.some((x) => x.s === 3)) b = [...b, ...(await search(base, {}))];
  // "Dead pool" finds an obscure "The Dead Pool" and never "Deadpool"; "5 feet apart" is "Five Feet Apart". Unless a famous exact title is already in hand, try the other spellings too.
  if (!settled(best(b, name, movieTitles, close))) for (const v of variants(name)) b = [...b, ...(await search(v, {}))];
  return best(dedupe(b), name, movieTitles, close);
}
const dedupe = (rs: any[]) => { const seen = new Set<number>(); return rs.filter((r) => !seen.has(r.id) && !!seen.add(r.id)); };

/** TV fallback for free-text lists, which can hold series too. Same forgiving match; a year can also settle for the first result. */
async function findTv(name: string, year: number | null): Promise<Found | null> {
  const res = ((await tmdb("/search/tv", { query: name, include_adult: "false", ...(year ? { first_air_date_year: String(year) } : {}) }, DAY_MS)).results ?? []) as any[];
  return best(res, name, tvTitles) ?? (year && res[0] ? { all: [{ hit: res[0], s: 2 }] } : null);
}

const fields = (d: any) => ({ title: (d.title ?? d.name ?? "") as string, year: ((d.release_date ?? d.first_air_date ?? "") as string).slice(0, 4), poster: (d.poster_path ?? null) as string | null });

/** How one imported line was matched: the line as parsed, the movie and TV candidates TMDB gave, and which one was stored. Written to `import_log`. */
export interface TraceRow { input: string; asTv: boolean; watched: boolean; watching: boolean; watchlist: boolean; movie: Cand | null; tv: Cand | null; picked: MediaType | null; error?: string }
type Cand = { id: number; title: string; year: string };

/**
 * For a name TMDB's search finds nothing for (a typo: "Erin brokovich", "The big lebowskey"): search its longest words alone, each also cut short
 * (TMDB matches the start of the last word, so "lebowsk" finds "Lebowski"), and keep the titles that look most like the whole name.
 */
async function looseSearch(name: string): Promise<SearchHit[]> {
  const all = [...new Set(name.split(/[\s\p{P}]+/u).filter((w) => w.length >= 3))];
  const longest = [...all].sort((a, b) => b.length - a.length).slice(0, 3);
  const words = longest.slice(0, 2);
  // Each long word alone and cut short, and the longest words together in the order typed ("brother where" finds "O Brother, Where Art Thou?").
  const together = (ws: string[]) => all.filter((w) => ws.includes(w)).join(" ");
  const probes = [...words.flatMap((w) => [w, ...[1, 2].filter((cut) => w.length - cut >= 4).map((cut) => w.slice(0, w.length - cut))]),
    ...(words.length === 2 ? [together(words)] : []), ...(longest.length === 3 ? [together([longest[0], longest[2]])] : [])];
  const pools = await Promise.all(probes.map((w) => search(w, "title").catch(() => [] as SearchHit[])));
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

/** Titles from the "Find it" search, plus the loose search when that finds little, ranked by how much they look like the typed name. */
async function nearHits(q: string): Promise<BrowseItem[]> {
  const toItems = (hs: SearchHit[]) => hs.filter((h): h is Extract<SearchHit, { kind: "title" }> => h.kind === "title").map((h) => { const { kind, ...rest } = h; void kind; return { ...rest, rating: 0 } as BrowseItem; });
  let hits = toItems(await search(q, "title").catch(() => []));
  if (!hits.length || Math.max(...hits.map((h) => sim(q, h.title))) < 0.8) {
    const have = new Set(hits.map((h) => h.key));
    hits = [...hits, ...toItems(await looseSearch(q)).filter((h) => !have.has(h.key))];
  }
  return hits.map((h, i) => ({ h, i, r: sim(q, h.title) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.h);
}

type C = { hit: any; s: number; lit?: boolean; type: MediaType; w: number };
const weight = (s: number, lit?: boolean) => (s === 3 ? (lit ? 4 : 1) : s === 2 ? 0.5 : 0.1);
const dateOf = (h: any) => (h?.release_date ?? h?.first_air_date ?? "") as string;
const titleOf = (h: any) => (h?.title ?? h?.name ?? "") as string;

/** Every film and series of that name, ranked by how well the title matches and how well known it is (vote count). */
async function poolFor(q: string, e: LbEntry): Promise<C[]> {
  const [mv, tvh] = await Promise.all([findMovie(q, e.year), e.tv ? findTv(q, e.year) : null]);
  let pool: C[] = [...(mv?.all ?? []).map((x) => ({ ...x, type: "movie" as MediaType })), ...(tvh?.all ?? []).map((x) => ({ ...x, type: "tv" as MediaType }))].map((x) => ({ ...x, w: (fame(x.hit) + 5) * weight(x.s, x.lit) }));
  // A line marked as watching is a series, so films are left out when a series matches.
  if (e.watching && pool.some((c) => c.type === "tv" && c.s >= 2)) pool = pool.filter((c) => c.type === "tv");
  return pool.sort((a, b) => b.w - a.w);
}

/**
 * Sure = the same title, and nothing else of that name (the other kind, a remake, a typo of a famous title) comes close in how well known it is.
 * A sequel or spin-off with a longer title ("Thor: Ragnarok") is not a rival of "Thor"; only a title that matches as well is. `why` is empty when sure.
 */
function judge(pool: C[], e: LbEntry, newest: boolean, tz?: string): { top?: C; second?: C; why: string } {
  const top = pool[0] as C | undefined;
  if (!top) return { why: "" };
  if (newest) {
    // "... live action" / "remake": the newest film of that name.
    const today = dayIn(Date.now(), tz);
    const latest = pool.filter((c) => c.type === "movie" && c.s === 3 && fame(c.hit) >= 100 && dateOf(c.hit) && dateOf(c.hit) <= today).sort((a, b) => dateOf(b.hit).localeCompare(dateOf(a.hit)))[0];
    if (latest) return { top: latest, why: "" };
  }
  const second = pool.find((c) => c !== top && c.s >= top!.s);
  const exact = top.s === 3 || (top.s === 2 && (!!e.year || fame(top.hit) >= 100));
  const dominant = !second || !!e.year || top.w >= 3 * second.w;
  // A misspelling of a famous title nobody else is near, with no real title of that name, is taken as the famous title.
  const typoOk = top.s === 1 && fame(top.hit) >= 500 && !pool.some((c) => c.s >= 2) && (!second || top.w >= 4 * second.w);
  let why = "";
  if (top.s === 1 && !typoOk) why = pool.some((c) => c.s >= 2) ? "Spelled a little differently from a better known title." : "The spelling is a little different.";
  else if (top.s === 2 && !exact) why = "The title only partly matches.";
  else if (!typoOk && !dominant) why = second!.type !== top.type && second!.s === 3 ? (top.type === "tv" ? "There is a film with the same name." : "There is a series with the same name.") : "Several titles share this name.";
  else if (e.watching && top.type === "movie") why = "Marked as watching, which fits a series better.";
  else if (!e.year && dateOf(top.hit) > dayIn(Date.now(), tz)) why = "This one is not out yet.";
  return { top, second, why };
}

/** "Avatar 2" is the second film of the Avatar collection, whatever its title is ("The Way of Water"). The film is only a guess to confirm. */
async function sequelGuess(name: string, tz?: string): Promise<{ guess: BrowseItem; alts: BrowseItem[]; why: string } | null> {
  const t = trailingNumber(name);
  if (!t || t.n < 2 || t.n > 12) return null;
  const found = (((await tmdb("/search/movie", { query: t.base, include_adult: "false" }, DAY_MS)).results ?? []) as any[])
    .filter((r) => score(movieTitles(r), t.base) === 3).sort((a, b) => fame(b) - fame(a))[0];
  if (!found || fame(found) < 100) return null;
  const cid = (await tmdb(`/movie/${found.id}`, {}, DAY_MS)).belongs_to_collection?.id;
  if (!cid) return null;
  const col = await tmdb(`/collection/${cid}`, {}, DAY_MS);
  const today = dayIn(Date.now(), tz);
  const parts = ((col.parts ?? []) as any[]).filter((p) => p.release_date && p.release_date <= today).sort((a, b) => a.release_date.localeCompare(b.release_date));
  const pick = parts[t.n - 1];
  if (!pick || pick.id === found.id) return null;
  const alts = parts.filter((p) => p.id !== pick.id).map((p) => asItem("movie", p)).slice(0, 4);
  return { guess: asItem("movie", pick), alts, why: `Film ${t.n} of ${col.name ?? "the collection"}.` };
}

/** Run `fn` over `items` at most `n` at a time, so a long list does not flood TMDB. */
async function mapLimit<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/** Match export entries to TMDB. `unmatched` lists names nothing was found for; `unsure` names a best guess to confirm before it is saved. */
export async function resolveEntries(entries: LbEntry[], tz?: string): Promise<{ rows: Resolved[]; unmatched: Unmatched[]; unsure: Unsure[]; trace: TraceRow[] }> {
  const rows: Resolved[] = [], unmatched: Unmatched[] = [], unsure: Unsure[] = [], trace: TraceRow[] = [];
  await mapLimit(entries, 12, async (e) => {
    const label = e.year ? `${e.name} (${e.year})` : e.name;
    const status: Status = e.watched ? "watched" : e.watching ? "watching" : "watchlist";
    try {
      const { name: typed, newest } = splitQualifier(searchName(e.name));
      let q = typed;
      let pool = await poolFor(q, e);
      let v = judge(pool, e, newest, tz);
      let near: BrowseItem[] | null = null;
      let doubtful = false;
      let suggested: string | null = null;

      // Nothing matched the typed name: a numbered sequel by its place in the collection ("Avatar 2"), or the name spelled the way a close title or Wikipedia spells it.
      const obscureTop = !!v.top && v.top.s < 3 && fame(v.top.hit) < 100 && !e.year;
      if (!v.top || obscureTop) {
        const sq = v.top ? null : await sequelGuess(q, tz).catch(() => null);
        if (sq) {
          trace.push({ input: label, asTv: !!e.tv, watched: e.watched, watching: !!e.watching, watchlist: e.watchlist, movie: { id: sq.guess.id, title: sq.guess.title, year: sq.guess.year }, tv: null, picked: "movie" });
          unsure.push({ label, status, rating: e.rating, why: sq.why, guess: sq.guess, alts: sq.alts });
          return;
        }
        near = await nearHits(q);
        const names: string[] = [];
        for (const h of near) if (charSim(q, h.title) >= 0.8 && sameNumbers(q, h.title) && names.length < 2 && !names.includes(h.title)) names.push(h.title);
        if (!near[0] || charSim(q, near[0].title) < 0.85) { const s = await suggestSpelling(q); if (s && sameNumbers(q, s)) { names.push(s); suggested = s; } }
        for (const nm of names) {
          if (normSeq(nm) === normSeq(q)) continue;
          const p2 = await poolFor(nm, e);
          const v2 = judge(p2, e, newest, tz);
          if (!v2.top || v2.top.s !== 3 || !sameNumbers(q, titleOf(v2.top.hit))) continue;
          // A different spelling is only trusted when the match is a well known title that looks like what was typed.
          const like = charSim(q, titleOf(v2.top.hit));
          const trusted = !v2.why && ((fame(v2.top.hit) >= 500 && like >= 0.78) || (fame(v2.top.hit) >= 100 && like >= 0.9));
          pool = p2; q = nm;
          v = trusted ? v2 : { ...v2, why: v2.why || "The spelling is a little different." };
          doubtful = !trusted;
          break;
        }
      }
      const { top, second, why } = v;
      const cand = (c?: C) => (c ? { id: c.hit.id as number, title: titleOf(c.hit), year: dateOf(c.hit).slice(0, 4) } : null);
      trace.push({ input: label, asTv: !!e.tv, watched: e.watched, watching: !!e.watching, watchlist: e.watchlist, movie: cand(pool.find((c) => c.type === "movie")), tv: cand(pool.find((c) => c.type === "tv")), picked: top?.type ?? null });
      if (top && !why) { rows.push({ type: top.type, id: top.hit.id, ...fields(top.hit), watched: e.watched, watching: !!e.watching, rating: e.rating, date: e.date, label }); return; }

      // Not sure, or not found by the strict match: ask the same search the "Find it" box uses, so its first result is never missed.
      let hits = near ?? await nearHits(q);
      // Nothing near what was typed, but a spelling fix exists ("Zotropolis" is "Zootropolis", TMDB's "Zootopia"): offer what the fixed spelling finds.
      if (!top && !hits.length && suggested) hits = await nearHits(suggested);
      const obscure = !!top && top.s < 3 && fame(top.hit) < 100 && !e.year;
      if (!top && !hits.length) { unmatched.push({ label, status, rating: e.rating }); return; }
      // A series that is marked as watching and has no series match: prefer the first series the search finds over a film.
      const seriesFirst = e.watching && (!top || top.type === "movie") ? hits.find((h) => h.type === "tv") : undefined;
      // A partial match nobody has voted on (a concert film, a podcast) loses to whatever the search ranks first.
      const first: BrowseItem = seriesFirst ?? (top && !(obscure && hits[0]) ? asItem(top.type, top.hit) : hits[0]);
      const alts: BrowseItem[] = [];
      for (const c of [...pool.filter((c) => c.s === 3 || fame(c.hit) >= 20).map((c) => asItem(c.type, c.hit)), ...hits]) {
        if (c.key !== first.key && !alts.some((a) => a.key === c.key)) alts.push(c);
      }
      const weak = !top && sim(suggested ?? q, first.title) < 0.5;
      // Only a clear favourite may be added in bulk; a toss-up between several titles is for the user to settle.
      const risky = !top || obscure || doubtful || top.s < 3 || !!seriesFirst || (!!second && top.w < 2 * second.w);
      unsure.push({ label, status, rating: e.rating, why: weak ? "Nothing close; this is only the nearest search result." : why || "Best guess from search.", ...(weak ? { weak } : {}), ...(risky ? { risky } : {}), guess: first, alts: alts.slice(0, 4) });
    } catch (err) {
      unmatched.push({ label, status, rating: e.rating, error: "Could not look this up on TMDB." });
      trace.push({ input: label, asTv: !!e.tv, watched: e.watched, watching: !!e.watching, watchlist: e.watchlist, movie: null, tv: null, picked: null, error: String((err as Error)?.message ?? err).slice(0, 200) });
    }
  });
  franchisePass(rows, unsure);
  return { rows, unmatched, unsure, trace };
}

/**
 * Several films share a name ("Descendants", 2011 and 2015) and the list itself says which: it also holds "Descendants 2" (2017), so the one whose
 * title starts that later title and came a few years before it is the one meant. Still left for the user to confirm, but no longer a toss-up.
 */
function franchisePass(rows: Resolved[], unsure: Unsure[]): void {
  for (const u of unsure) {
    if (u.weak || !/share this name|spelling/i.test(u.why)) continue;
    const cands = [u.guess, ...u.alts].filter((c) => c.type === "movie" && /^\d{4}$/.test(c.year));
    const proof = (c: BrowseItem) => rows.find((r) => r.type === "movie" && r.id !== c.id && /^\d{4}$/.test(r.year) && +r.year > +c.year && +r.year - +c.year <= 15 && startsWithWords(r.title, c.title));
    const pick = cands.find((c) => proof(c));
    if (!pick) continue;
    if (pick.key !== u.guess.key) { u.alts = [u.guess, ...u.alts.filter((a) => a.key !== pick.key)].slice(0, 4); u.guess = pick; }
    u.why = `Same series as “${proof(pick)!.title}” in this list.`;
    delete u.risky;
  }
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
  // Chunked: a long `in` list overruns the URL, and each chunk's answer must stay under the 1000-row response cap (a movie and a series can share an id, so at most 2 per id).
  const ids = [...new Set(rows.map((r) => r.id))], data: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: part, error } = await sb.from("library_items").select("tmdb_type,tmdb_id,status,rating,watched_at,checked_at").eq("user_id", userId).in("tmdb_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    data.push(...(part ?? []));
  }
  const have = new Map<string, Prev>(data.map((d: any) => [`${d.tmdb_type}:${d.tmdb_id}`, d]));
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
export async function syncLetterboxd(sb: Sb, userId: string, force = false, tz?: string): Promise<SyncResult> {
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
      try { rows.push({ type: e.type, id: e.id, ...fields(await tmdb(`/${e.type}/${e.id}`, {}, DAY_MS)), watched: true, rating: e.rating, date: e.watched ?? dayIn(e.pub, tz) }); }
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
