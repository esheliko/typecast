import type { KnownTitle } from "./who-known";
import type { SharedBrief, TitleNode, WhoBrief, WhoEp, WhoEpDetail } from "./who-data";
import type { FoundTitle, Shared } from "./who-common";
import type { PersonData, Pos, Span, WhoRoster } from "./who-types";
import { cleanRecents, upsertRecent, type RecentTrail } from "./who-trail";
import { lineParams } from "./spoiler-line";

/**
 * Browser side of /who: one in-memory cache for the whole session (a request is made once; a failed one is forgotten so it can be retried),
 * the typed calls to /api/who/*, and the "recently opened" row. No server imports (types only).
 */
const mem = new Map<string, { t: number; p: Promise<unknown> }>();

/** Library-aware answers (a series under a spoiler line, docs/features/spoilers.md) are kept this long: the saved place moves as the user ticks episodes and this cache cannot see it. */
export const LINE_TTL_MS = 30_000;

/** Is a cached answer still good? No `ttl` means for the whole session. Pure; unit tested. */
export const fresh = (t: number, now: number, ttl?: number): boolean => ttl === undefined || now - t < ttl;

export function getJson<T>(url: string, ttl?: number): Promise<T> {
  const hit = mem.get(url);
  if (hit && fresh(hit.t, Date.now(), ttl)) return hit.p as Promise<T>;
  const p = fetch(url).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j?.error === "string" ? j.error : `Request failed (${r.status})`);
    return j as T;
  });
  const entry = { t: Date.now(), p };
  mem.set(url, entry);
  p.catch(() => { if (mem.get(url) === entry) mem.delete(url); });
  if (mem.size > 400) mem.delete(mem.keys().next().value!);
  return p;
}

const q = (o: Record<string, string | number | null | undefined>) =>
  Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

/** The /watching page: its title key and whether its No spoilers switch is off (spoilers shown). */
export interface PageRef { key: string; spoilersShown: boolean }

export const posKey = (p: Pos | null) => (p ? `${p.s ?? "-"}.${p.e ?? "-"}` : "film");

export const whoApi = {
  roster: (k: string, pos: Pos | null, fast = false) => getJson<WhoRoster>(`/api/who/roster?${q({ k, s: pos?.s, e: pos?.e, fast: fast ? 1 : undefined })}`),
  season: (tv: number, s: number, e?: number | null) => getJson<{ air: string; episodes: WhoEp[]; detail: WhoEpDetail | null }>(`/api/who/season?${q({ tv, s, e })}`),
  person: (id: number) => getJson<PersonData>(`/api/who/person?id=${id}`),
  /** `page` names the /watching title and its switch; `reveal` lists the keys whose spoiler line the reader lifted (this request only). */
  spans: (p: number, keys: string[], cur?: { k: string; pos: Pos | null; cids: string[] } | null, line?: { page?: PageRef | null; reveal?: string[] }) =>
    getJson<Record<string, Span | null>>(`/api/who/spans?${q({ p, keys: keys.join(","), cur: cur?.k, s: cur?.pos?.s, e: cur?.pos?.e, cids: cur?.cids.join(","), ...lineParams({ page: line?.page }), reveal: line?.reveal?.length ? line.reveal.join(",") : undefined })}`, LINE_TTL_MS),
  known: (ids: number[]) => getJson<{ known: Record<number, { top: KnownTitle[] }> }>(`/api/who/known?ids=${ids.join(",")}`),
  shared: (id: number, others: number[], cur: string) => getJson<{ shared: SharedBrief[] }>(`/api/who/shared?${q({ id, with: others.join(","), cur })}`),
  pair: (a: number, b: number) => getJson<{ a: PersonData; b: PersonData; titles: Shared[] }>(`/api/who/pair?a=${a}&b=${b}`),
  title: (k: string, line?: { page?: PageRef | null; reveal?: boolean }) => getJson<TitleNode>(`/api/who/title?${q({ k, ...lineParams({ page: line?.page, reveal: line?.reveal }) })}`, LINE_TTL_MS),
  common: (query: string, k: string, pos: Pos | null) => getJson<{ titles: FoundTitle[] }>(`/api/who/common?${q({ q: query, k, s: pos?.s, e: pos?.e })}`),
};

export type { WhoBrief, RecentTrail };

/* ---------- recently opened (this session): one entry per branch of history ---------- */

const RECENT_KEY = "typecast.who.recent2";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

export const readRecent = (): RecentTrail[] => safe(() => cleanRecents(JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? "[]")), []);
export function saveRecent(r: RecentTrail): RecentTrail[] {
  const next = upsertRecent(readRecent(), r);
  safe(() => sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)), undefined);
  return next;
}
