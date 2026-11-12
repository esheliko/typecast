import type { KnownTitle } from "./who-known";
import { unstable_cache } from "next/cache";
import { buildAllRoster, buildRoster, asGender, scopeKind } from "./who-scope";
import { commonResults, sharedTitles, type CastEntry, type FoundTitle, type Shared } from "./who-common";
import { spanFromEpisodes, spanUnderLine, type CreditEp, type CreditSeason } from "./who-spans";
import { tmdb, TmdbError } from "./tmdb";
import { getFandomEpisodeCast } from "./fandom";
import { missingGuests, normName, tvmazeEpisodeIds, tvmazeGuests } from "./tvmaze";
import type { MediaType } from "./types";
import { isHidden, type HiddenLine, type SpoilerLine } from "./spoiler-line";
import type { AggPerson, PCredit, PersonData, Pos, SeasonData, SeasonPerson, ShowRun, Span, WhoFace, WhoRoster } from "./who-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server side of /who. Every function here is read-only TMDB work, cached the way the rest of the app does it: TMDB responses through
 * `tmdb()` (Next's fetch cache, 6-24 h), assembled results through `cached()` (Next's data cache, with the same plain-call fallback wiki.ts
 * uses so scripts and tests run without a Next runtime), and a small in-process map for hot, tiny results.
 */
const HOUR = 3600;

/** Next's data cache, or a plain call when there is none (scripts, tests). Same idea as wiki.ts. */
function cached<A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string, revalidate = 6 * HOUR): (...a: A) => Promise<R> {
  const c = unstable_cache(fn, [key], { revalidate });
  return async (...a) => { try { return await c(...a); } catch (e) { if (/incrementalCache missing|Invariant/.test(String(e))) return fn(...a); throw e; } };
}

/** Runs `fn` over `items` with at most `n` in flight, keeping order. A failed item yields null. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (let j = i++; j < items.length; j = i++) { try { out[j] = await fn(items[j]); } catch { out[j] = null; } }
  }));
  return out;
}

const BAD_ROLE = /\b(self|himself|herself|themselves|archive footage)\b/i;
const TALK = new Set([10767, 10763, 10764]);
const tidyRole = (r: string) => String(r ?? "").replace(/\s*\((uncredited|archive footage)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
const yr = (d?: string) => (d ?? "").slice(0, 4);

/* ---------- the title itself ---------- */

export interface WhoSeason { n: number; name: string; eps: number; air: string }
export interface WhoBrief {
  key: string; type: MediaType; id: number; title: string; year: string; poster: string | null;
  overview: string; genres: string[]; runtime: number | null; status: string;
  /** A film's release date, or a series' first and last (latest) episode dates. */
  first: string; last: string;
  seasons: WhoSeason[];
  imdbId: string | null;
}

export const loadBrief = cached(async (type: MediaType, id: number): Promise<WhoBrief> => {
  const d = await tmdb(`/${type}/${id}`, { append_to_response: "external_ids" }, 6 * HOUR);
  return {
    key: `${type}:${id}`, type, id, title: d.title ?? d.name ?? "", year: yr(d.release_date ?? d.first_air_date), poster: d.poster_path ?? null,
    overview: d.overview ?? "", genres: (d.genres ?? []).map((g: any) => g.name), runtime: (type === "movie" ? d.runtime : d.episode_run_time?.[0]) ?? null, status: d.status ?? "",
    first: d.release_date ?? d.first_air_date ?? "", last: type === "tv" ? (d.last_air_date ?? "") : (d.release_date ?? ""),
    seasons: type === "tv" ? ((d.seasons ?? []) as any[]).map((s) => ({ n: s.season_number as number, name: s.name ?? `Season ${s.season_number}`, eps: s.episode_count ?? 0, air: s.air_date ?? "" }))
      .filter((s) => s.eps > 0 || s.n > 0).sort((a, b) => a.n - b.n) : [],
    imdbId: d.external_ids?.imdb_id || null,
  };
}, "who-brief-v1");

/* ---------- a season: the episode list, and one episode's details ---------- */

export interface WhoEp { e: number; name: string; air: string; runtime: number | null; still: string | null; aired: boolean }
export interface WhoEpDetail extends WhoEp { overview: string; directors: string[]; writers: string[] }

const crewOf = (x: any, jobs: string[]) => [...new Set<string>((x.crew ?? []).filter((c: any) => jobs.includes(c.job)).map((c: any) => c.name))].slice(0, 3);

/** One season's episodes for the episode select (no summaries), and with `e`, that episode's card. Specials are season 0. */
export async function loadSeason(tv: number, s: number, e?: number, today = new Date().toISOString().slice(0, 10)): Promise<{ air: string; episodes: WhoEp[]; detail: WhoEpDetail | null }> {
  const d = await tmdb(`/tv/${tv}/season/${s}`, {}, 6 * HOUR);
  const now = today;
  const episodes: WhoEp[] = ((d.episodes ?? []) as any[]).map((x) => ({
    e: x.episode_number, name: x.name ?? "", air: x.air_date ?? "", runtime: x.runtime ?? null, still: x.still_path ?? null, aired: !!x.air_date && x.air_date <= now,
  }));
  const one = e ? ((d.episodes ?? []) as any[]).find((x) => x.episode_number === e) : null;
  const detail: WhoEpDetail | null = one ? {
    ...episodes.find((x) => x.e === e)!, overview: one.overview ?? "", directors: crewOf(one, ["Director"]), writers: crewOf(one, ["Writer", "Teleplay", "Story"]),
  } : null;
  return { air: d.air_date ?? "", episodes, detail };
}

/* ---------- the roster ---------- */

const person = (c: any, role: string): SeasonPerson => ({ id: c.id, name: c.name ?? "", photo: c.profile_path ?? null, g: asGender(c.gender), role });

function aggPerson(c: any): AggPerson {
  const roles: any[] = [...(c.roles ?? [])].sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0));
  const names = [...new Set(roles.map((r) => tidyRole(r.character)).filter(Boolean))];
  return {
    ...person(c, names.slice(0, 3).join(" / ")),
    total: c.total_episode_count ?? roles.reduce((n, r) => n + (r.episode_count ?? 0), 0),
    cids: roles.map((r) => r.credit_id).filter(Boolean).slice(0, 8),
  };
}

async function fetchSeasonData(tv: number, n: number, full: boolean): Promise<SeasonData | null> {
  try {
    const d = await tmdb(`/tv/${tv}/season/${n}`, { append_to_response: full ? "aggregate_credits,credits" : "aggregate_credits" }, 6 * HOUR);
    return {
      n, air: d.air_date ?? "",
      episodes: ((d.episodes ?? []) as any[]).map((x) => ({
        e: x.episode_number, name: x.name ?? "", air: x.air_date ?? "", runtime: x.runtime ?? null, still: x.still_path ?? null,
        guests: ((x.guest_stars ?? []) as any[]).map((g) => ({ ...person(g, tidyRole(g.character)), ...(g.credit_id ? { cid: g.credit_id as string } : {}) })),
      })),
      agg: ((d.aggregate_credits?.cast ?? []) as any[]).map(aggPerson),
      regulars: ((d.credits?.cast ?? []) as any[]).map((c) => person(c, tidyRole(c.character))),
    };
  } catch (e) { if (e instanceof TmdbError && e.status === 404) return null; throw e; }
}

const MAX_FACES = 2500;

/** A TMDB person by exact (accent-free) name, the most popular one when several share it. Null when there is none. */
async function tmdbPersonByName(name: string): Promise<SeasonPerson | null> {
  const d = await tmdb("/search/person", { query: name, include_adult: "false" }, 7 * 24 * HOUR);
  const k = normName(name);
  const hit = ((d.results ?? []) as any[]).filter((r) => normName(String(r.name)) === k).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  return hit ? person(hit, "") : null;
}

/**
 * TMDB's guest lists miss people. For the exact season, add what TVmaze lists for episode `upto` and (best effort, nearest first)
 * the earlier episodes of the season, matched back to TMDB people by exact name so every face still opens a person page.
 * Nothing found or reachable means the season is returned as TMDB gave it.
 */
async function fillGuests(sd: SeasonData, brief: WhoBrief, upto: number): Promise<SeasonData> {
  const ids = await tvmazeEpisodeIds(brief.imdbId);
  const mine = sd.episodes.filter((x) => x.e <= upto).sort((a, b) => b.e - a.e).slice(0, 13);
  const regulars = sd.regulars.map((r) => r.name);
  const added = await pool(mine, 3, async (ep) => {
    const id = ids.get(`${sd.n}x${ep.e}`);
    // Two second opinions on who is in the episode: TVmaze's guest cast and the show's Fandom wiki cast list (which also names regulars TMDB leaves out).
    const [maze, wiki] = await Promise.all([id ? tvmazeGuests(id) : Promise.resolve([]), getFandomEpisodeCast(brief.imdbId, brief.title, sd.n, ep.name)]);
    const extra = missingGuests([...ep.guests.map((g) => g.name), ...regulars], [...maze, ...wiki]);
    const found = await pool(extra, 3, async (g) => { const p = await tmdbPersonByName(g.name); return p ? { ...p, role: tidyRole(g.role) } : null; });
    return found.filter((p): p is SeasonPerson => !!p);
  });
  const byEp = new Map(mine.map((ep, i) => [ep.e, added[i] ?? []]));
  return { ...sd, episodes: sd.episodes.map((ep) => (byEp.get(ep.e)?.length ? { ...ep, guests: [...ep.guests, ...byEp.get(ep.e)!] } : ep)) };
}

async function rosterFor(type: MediaType, id: number, pos: Pos | null, fast = false): Promise<WhoRoster> {
  if (type === "movie") {
    const d = await tmdb(`/movie/${id}/credits`, {}, 24 * HOUR);
    const faces: WhoFace[] = ((d.cast ?? []) as any[]).slice(0, 220).map((c, i) => ({
      id: c.id, name: c.name ?? "", photo: c.profile_path ?? null, g: asGender(c.gender), role: tidyRole(c.character), part: (c.order ?? i) < 12 ? "main" : "guest",
      n: 0, ls: 0, le: 0, cids: [],
    }));
    return { key: `movie:${id}`, type, pos: null, scope: null, faces, note: null, partial: false };
  }
  const p: Pos = pos ?? { s: null, e: null };
  const kind = scopeKind(p)!;
  const brief = await loadBrief("tv", id);
  let faces: WhoFace[]; let partial = false; let note: string | null = null;
  if (kind === "all") {
    const d = await tmdb(`/tv/${id}/aggregate_credits`, {}, 24 * HOUR);
    faces = buildAllRoster(((d.cast ?? []) as any[]).map((c, i) => ({ ...aggPerson(c), order: c.order ?? i })));
    note = "The season is not set, so the whole series is included. People from later seasons may appear.";
  } else {
    // Every season up to the position (specials stand alone): season 1..S, all of them, not just the last few.
    const wanted = p.s === 0 ? [0] : brief.seasons.filter((x) => x.n > 0 && x.n <= p.s!).map((x) => x.n);
    const list = await pool(wanted, 5, (n) => fetchSeasonData(id, n, n === p.s));
    const seasons = list.filter((x): x is SeasonData => !!x);
    if (kind === "exact" && !fast) {
      const i = seasons.findIndex((x) => x.n === p.s);
      if (i >= 0) seasons[i] = await fillGuests(seasons[i], brief, p.e!).catch(() => seasons[i]);
    }
    partial = seasons.length < wanted.length;
    faces = buildRoster(seasons, p);
    note = kind === "season" ? (p.s === 0 ? "Specials are listed on their own: everyone in them is included." : `Includes all of season ${p.s} because the episode is not set.`) : null;
    if (kind === "exact" && !seasons.some((x) => x.n === p.s)) partial = true;
  }
  return { key: `tv:${id}`, type, pos: p, scope: kind, faces: faces.slice(0, MAX_FACES), note, partial };
}

const rosterCached = cached(rosterFor, "who-roster-v4");
const hot = new Map<string, { t: number; v: Promise<WhoRoster> }>();
/** The roster for a position. `fast` skips the TVmaze/Fandom guest fill (the slow part) so the page can show TMDB's cast at once. Cached in Next's data cache for six hours and in this process for ten minutes. */
export function loadWhoRoster(type: MediaType, id: number, pos: Pos | null, fast = false): Promise<WhoRoster> {
  const k = `${type}:${id}:${pos?.s ?? "-"}:${pos?.e ?? "-"}:${fast ? "f" : ""}`;
  const h = hot.get(k);
  if (h && Date.now() - h.t < 10 * 60_000) return h.v;
  const v = rosterCached(type, id, pos, fast).catch((e) => { hot.delete(k); throw e; });
  hot.set(k, { t: Date.now(), v });
  if (hot.size > 60) hot.delete(hot.keys().next().value!);
  return v;
}

/* ---------- a person ---------- */

function personFrom(d: any): PersonData {
  const byKey = new Map<string, PCredit & { allExtra: boolean }>();
  for (const r of (d.combined_credits?.cast ?? []) as any[]) {
    if (r.media_type !== "movie" && r.media_type !== "tv") continue;
    const key = `${r.media_type}:${r.id}`;
    const extra = BAD_ROLE.test(r.character ?? "") || ((r.genre_ids ?? []) as number[]).some((g) => TALK.has(g));
    const date: string = r.media_type === "tv" ? (r.first_credit_air_date || r.first_air_date || "") : (r.release_date ?? "");
    const role = tidyRole(r.character);
    const o = byKey.get(key);
    if (!o) {
      byKey.set(key, {
        key, type: r.media_type, id: r.id, title: r.title ?? r.name ?? "", year: yr(r.release_date ?? r.first_air_date), poster: r.poster_path ?? null,
        role, date, eps: r.episode_count ?? 0, cids: r.credit_id ? [r.credit_id] : [], extra, allExtra: extra, votes: r.vote_count ?? 0, ...(typeof r.order === "number" ? { order: r.order } : {}),
      });
      continue;
    }
    if (role && !o.role.includes(role) && o.role.length < 80) o.role = o.role ? `${o.role} / ${role}` : role;
    if (date && (!o.date || date < o.date)) o.date = date;
    if (typeof r.order === "number" && (o.order === undefined || r.order < o.order)) o.order = r.order;
    o.eps += r.episode_count ?? 0;
    if (r.credit_id && !o.cids.includes(r.credit_id)) o.cids.push(r.credit_id);
    o.allExtra = o.allExtra && extra; o.extra = o.allExtra;
  }
  const credits = [...byKey.values()].map(({ allExtra, ...c }) => { void allExtra; return c; })
    .sort((a, b) => (b.date || b.year).localeCompare(a.date || a.year) || b.votes - a.votes);
  return {
    id: d.id, name: d.name ?? "", photo: d.profile_path ?? null, g: asGender(d.gender), birthday: d.birthday ?? "", deathday: d.deathday ?? "", place: d.place_of_birth ?? "",
    images: ((d.images?.profiles ?? []) as any[]).map((p) => p.file_path as string).filter((p) => p && p !== d.profile_path).slice(0, 8),
    credits,
  };
}

const personHot = new Map<number, { t: number; v: Promise<PersonData> }>();
/** One person: details, other profile photos and every acting credit, merged per title. Cached a day by TMDB's fetch cache, ten minutes in memory. */
export function loadWhoPerson(id: number): Promise<PersonData> {
  const h = personHot.get(id);
  if (h && Date.now() - h.t < 10 * 60_000) return h.v;
  const v = tmdb(`/person/${id}`, { append_to_response: "combined_credits,images", include_image_language: "en,null" }, 24 * HOUR).then(personFrom).catch((e) => { personHot.delete(id); throw e; });
  personHot.set(id, { t: Date.now(), v });
  if (personHot.size > 250) personHot.delete(personHot.keys().next().value!);
  return v;
}

/* ---------- a person's own dates in series ---------- */

const CID = /^[0-9a-f]{20,32}$/;
export const isCid = (s: string) => CID.test(s);

const showRuns = new Map<number, Promise<ShowRun | null>>();
function showRun(id: number) {
  let p = showRuns.get(id);
  if (!p) {
    p = tmdb(`/tv/${id}`, {}, 24 * HOUR).then((d): ShowRun => ({ first: d.first_air_date ?? "", last: d.last_air_date ?? d.first_air_date ?? "", ongoing: d.in_production === true || d.status === "Returning Series" })).catch(() => null);
    showRuns.set(id, p);
    if (showRuns.size > 300) showRuns.delete(showRuns.keys().next().value!);
  }
  return p;
}

async function creditEpisodes(cids: string[]): Promise<{ eps: CreditEp[]; seasons: CreditSeason[] }> {
  const ds = await pool(cids.slice(0, 12), 4, (id) => tmdb(`/credit/${id}`, {}, 24 * HOUR));
  const all = new Map<string, CreditEp>();
  const seasons = new Map<number, CreditSeason>();
  for (const d of ds) {
    for (const x of (d?.media?.episodes ?? []) as any[]) {
      if (x.season_number == null || x.episode_number == null) continue;
      all.set(`${x.season_number}:${x.episode_number}`, { s: x.season_number, e: x.episode_number, air: x.air_date ?? "" });
    }
    // A regular's credit often lists seasons instead of episodes.
    for (const x of (d?.media?.seasons ?? []) as any[]) if (x.season_number != null && x.air_date) seasons.set(x.season_number, { s: x.season_number, air: x.air_date });
  }
  return { eps: [...all.values()], seasons: [...seasons.values()] };
}

/**
 * For each series key, the person's own first-to-last episode dates (see who-spans.ts). `scope` is the show being watched with its position,
 * whose dates are clipped to what has happened so far; `extraCids` are the credit ids the roster already knows for that show.
 * Films have no span: their date is the release date, already on the credit.
 */
export async function loadSpans(personId: number, keys: string[], scope?: { key: string; pos: Pos | null; cids: string[] }, lines: Record<string, SpoilerLine> = {}): Promise<Record<string, Span | null>> {
  const p = await loadWhoPerson(personId);
  const wanted = keys.filter((k) => k.startsWith("tv:")).slice(0, 14);
  const res = await pool(wanted, 3, async (key) => {
    const c = p.credits.find((x) => x.key === key);
    const isScope = scope?.key === key;
    const clip = isScope ? scope!.pos : null; // no position (spoilers shown): extra credit ids only, nothing is clipped
    const cids = [...new Set([...(c?.cids ?? []), ...(isScope ? scope!.cids : [])])];
    if (!c && !isScope) return null;
    // A series that is Watching in the library keeps a spoiler line (spoiler-line.ts): with no saved place there is no TMDB lookup at all, with
    // one only what is up to and including it. The show's own run (its end, whether it still airs) is never sent for it.
    const line = isScope ? undefined : lines[key];
    if (line && isHidden(line) && c) return spanUnderLine(key, line, c.eps ?? 0, line.kind === "upto" ? await creditEpisodes(c.cids).catch(() => ({ eps: [], seasons: [] })) : { eps: [], seasons: [] });
    const [{ eps, seasons }, run] = await Promise.all([creditEpisodes(cids), clip ? Promise.resolve(null) : showRun(Number(key.slice(3)))]);
    const expected = c?.eps ?? 0;
    // The show's own run is only needed when neither the person's episode list nor their seasons give dates.
    const needRun = !clip && !seasons.length && (eps.filter((x) => x.air).length === 0 || (expected > 0 && eps.filter((x) => x.air).length < expected));
    const sp = spanFromEpisodes(key, eps, expected, needRun ? run : null, clip, seasons);
    return sp && run ? { ...sp, show: run } : sp;
  });
  return Object.fromEntries(wanted.map((k, i) => [k, res[i]]));
}

/* ---------- "you know them from": the few titles to match against the user's library ---------- */

export interface KnownFor { /** [key, title, year, character, episodes, votes] by votes, most known first (see who-known.ts). */ top: KnownTitle[] }

export async function loadKnown(ids: number[]): Promise<Record<number, KnownFor>> {
  const rows = await pool(ids.slice(0, 30), 6, async (id) => {
    const p = await loadWhoPerson(id);
    const top = p.credits.filter((c) => !c.extra).sort((a, b) => b.votes - a.votes).slice(0, 40).map((c): KnownTitle => [c.key, c.title, c.year, c.role, c.eps ?? 0, c.votes, c.order ?? -1]);
    return { id, top };
  });
  return Object.fromEntries(rows.flatMap((r) => (r ? [[r.id, { top: r.top }]] : [])));
}

/* ---------- with this cast / pairs ---------- */

export interface SharedBrief { id: number; total: number; titles: Shared[] }

/** For each of `others`, the titles they share with `id` (newest first), the current title left out. */
export async function loadShared(id: number, others: number[], exclude: string): Promise<SharedBrief[]> {
  const a = await loadWhoPerson(id);
  const rows = await pool(others.filter((o) => o !== id).slice(0, 30), 6, async (o) => {
    const b = await loadWhoPerson(o);
    const all = sharedTitles(a.credits, b.credits, { exclude });
    return { id: o, total: all.length, titles: all.slice(0, 3) };
  });
  return rows.filter((r): r is SharedBrief => !!r && r.total > 0).sort((x, y) => y.total - x.total);
}

export async function loadPair(a: number, b: number): Promise<{ a: PersonData; b: PersonData; titles: Shared[] }> {
  const [pa, pb] = await Promise.all([loadWhoPerson(a), loadWhoPerson(b)]);
  return { a: { ...pa, credits: [] }, b: { ...pb, credits: [] }, titles: sharedTitles(pa.credits, pb.credits, { extras: true }) };
}

/* ---------- a title as a node ---------- */

export interface TitleNode {
  brief: WhoBrief;
  /** The whole cast: [person id, role, episodes]. */
  cast: [number, string, number][];
  /** The top billed, with their faces. */
  top: { id: number; name: string; photo: string | null; role: string }[];
  /** Set when the title is a series that is Watching in the library: the end date, status and season list were cut (spoiler-line.ts). */
  hidden?: HiddenLine;
}

function castOf(type: MediaType, d: any): { entries: CastEntry[]; people: any[] } {
  const people = (d.cast ?? []) as any[];
  return {
    people,
    entries: people.map((c) => type === "tv"
      ? { id: c.id as number, role: tidyRole((c.roles ?? [])[0]?.character), n: c.total_episode_count as number }
      : { id: c.id as number, role: tidyRole(c.character) }),
  };
}

export async function loadTitleNode(type: MediaType, id: number): Promise<TitleNode> {
  const [brief, d] = await Promise.all([loadBrief(type, id), tmdb(type === "tv" ? `/tv/${id}/aggregate_credits` : `/movie/${id}/credits`, {}, 24 * HOUR)]);
  const { entries, people } = castOf(type, d);
  return {
    brief,
    cast: entries.slice(0, 600).map((c): [number, string, number] => [c.id, c.role, c.n ?? 0]),
    top: people.slice(0, 14).map((c, i) => ({ id: c.id, name: c.name ?? "", photo: c.profile_path ?? null, role: entries[i].role })),
  };
}

/** "Titles in common": search `q`, take the top three films or series, and keep the ones with someone from `rosterIds` in them. */
export async function loadCommon(q: string, rosterIds: ReadonlySet<number>): Promise<FoundTitle[]> {
  const s = await tmdb("/search/multi", { query: q, include_adult: "false" }, HOUR);
  const hits = ((s.results ?? []) as any[]).filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 3);
  const found = await pool(hits, 3, async (r) => {
    const type = r.media_type as MediaType;
    const d = await tmdb(type === "tv" ? `/tv/${r.id}/aggregate_credits` : `/movie/${r.id}/credits`, {}, 24 * HOUR);
    return { key: `${type}:${r.id}`, type, title: r.title ?? r.name ?? "", year: yr(r.release_date ?? r.first_air_date), poster: (r.poster_path ?? null) as string | null, pop: Number(r.popularity) || 0, cast: castOf(type, d).entries };
  });
  return commonResults(found.filter((x): x is NonNullable<typeof x> => !!x), rosterIds);
}
