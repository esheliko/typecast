import { lineCacheKey, lineParams, type HiddenLine, type SpoilerLine } from "./spoiler-line";
import type { EpisodeFaces } from "./episode-faces";
import type { Episode } from "./types";

/**
 * Browser-side loaders for one season of a series (the list, the faces per episode, IMDb's scores), each kept in a module cache so the same question is asked once.
 * Shared by the episode list and by the warm-up that starts them while a title page is still being replayed as a popup (components/EpisodesWarm.tsx).
 */
export interface Season { name: string; air: string; episodes: (Episode & { hidden?: true })[]; /** The series is Watching in the library and later episodes were held back (docs/features/spoilers.md). */ hidden?: HiddenLine }
type Page = { key: string; spoilersShown: boolean } | null;
type P = { s: number; e: number } | null;

const seasonCache = new Map<string, Promise<Season>>();
/**
 * `line` is the spoiler line the browser expects the server to use for this series (the saved place is in `Mark.progress`), `page` the /watching page when its
 * switch shows spoilers for this very title, `reveal` the gate's Show: together the exact cache key and the request, so a moved place is simply another entry.
 */
export function loadSeason(tv: number, s: number, line: SpoilerLine, page: Page, reveal: boolean): Promise<Season> {
  const k = `${tv}:${s}:${lineCacheKey({ page, reveal, line })}`;
  let p = seasonCache.get(k);
  if (!p) {
    const extra = new URLSearchParams(lineParams({ page, reveal })).toString();
    p = fetch(`/api/season?tv=${tv}&s=${s}${extra ? `&${extra}` : ""}`).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not load this season."); return r.json(); });
    p.catch(() => seasonCache.delete(k));
    seasonCache.set(k, p);
  }
  return p;
}

/** The light per-season faces (top 3 per episode), asked when a season opens; the server applies the same line. Failing just means no faces. */
const facesCache = new Map<string, Promise<EpisodeFaces[]>>();
export function loadFaces(tv: number, s: number, lk: string, page: Page, reveal: boolean): Promise<EpisodeFaces[]> {
  const k = `${tv}:${s}:${lk}`;
  let p = facesCache.get(k);
  if (!p) {
    const extra = new URLSearchParams(lineParams({ page, reveal })).toString();
    p = fetch(`/api/season-faces?tv=${tv}&s=${s}${extra ? `&${extra}` : ""}`).then(async (r) => { if (!r.ok) throw new Error("faces failed"); return ((await r.json()).episodes ?? []) as EpisodeFaces[]; });
    p.catch(() => facesCache.delete(k));
    facesCache.set(k, p);
  }
  return p;
}

/** IMDb's score per episode of one season; an empty answer (never a rejection) when there is none. */
const imdbCache = new Map<string, Promise<Record<number, number>>>();
export function loadImdbEps(tv: number, s: number): Promise<Record<number, number>> {
  const k = `${tv}:${s}`;
  let p = imdbCache.get(k);
  if (!p) {
    p = fetch(`/api/imdb?tv=${tv}&s=${s}`).then((r) => (r.ok ? r.json() : { eps: {} }), () => ({ eps: {} })).then((d) => (d.eps ?? {}) as Record<number, number>);
    imdbCache.set(k, p);
    setTimeout(() => { if (imdbCache.get(k) === p) imdbCache.delete(k); }, 5 * 60_000);
  }
  return p;
}

/** The season to open on: where you are up to (or the next season once that one is done), else the first. */
export function startSeason(seasons: { n: number; eps: number }[], p: P): number {
  if (!p) return seasons[0]?.n ?? 1;
  const cur = seasons.find((x) => x.n === p.s);
  if (cur && p.e >= cur.eps) return seasons.find((x) => x.n > p.s)?.n ?? p.s;
  return cur ? p.s : seasons[0]?.n ?? 1;
}
