import { browse, browseItem, tmdb } from "./tmdb";
import type { BrowseItem, LibItem, MediaType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGE = 20;
const SEEDS = 8;

/** Small deterministic generator, so every page of one visit draws from the same picks but a refresh draws different ones. */
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2 ** 32; }; }

/** The titles that say most about taste: loved or must-watch first, then anything watched. Low-rated ones are left out. */
function pickSeeds(lib: LibItem[], type: MediaType, salt: number) {
  const weighted = lib.filter((l) => l.type === type).map((l) => {
    const w = l.status === "watched" || l.status === "watching" ? (l.rating >= 4 ? 3 : l.rating > 0 && l.rating <= 2 ? 0 : 1.5) : l.priority === "must" ? 2.5 : 0;
    return { l, w };
  }).filter((x) => x.w > 0).sort((a, b) => b.w - a.w || b.l.added - a.l.added).slice(0, 30);
  const r = rng(salt);
  return weighted.map((x) => ({ ...x, k: r() * x.w })).sort((a, b) => b.k - a.k).slice(0, SEEDS);
}

/**
 * Picks for you: what TMDB recommends for the titles you watched and loved, scored by how many of them agree.
 * Anything already in your library is left out. Once those run out the list continues with popular titles in your favourite genres, so it never ends.
 */
export async function forYou(type: MediaType, page: number, lib: LibItem[], salt: number): Promise<{ items: BrowseItem[]; more: boolean; notice?: string }> {
  const seeds = pickSeeds(lib, type, salt);
  if (!seeds.length) {
    const r = await browse("popular", type, page);
    return { ...r, notice: "Mark a few titles you have watched or want to watch and this list turns into picks based on them. Showing popular for now." };
  }
  const own = new Set(lib.map((l) => l.key));
  const lists = await Promise.all(seeds.flatMap((s) => [1, 2].map((p) =>
    tmdb(`/${type}/${s.l.id}/recommendations`, { page: String(p) }).then((d) => ({ w: s.w, rs: (d.results ?? []) as any[] })).catch(() => ({ w: 0, rs: [] as any[] })))));

  const pool = new Map<number, { r: any; score: number }>();
  const genres = new Map<number, number>();
  for (const { w, rs } of lists) for (const r of rs) {
    if (!r.poster_path || own.has(`${type}:${r.id}`)) continue;
    const e = pool.get(r.id) ?? { r, score: 0 };
    e.score += w * (1 + (r.vote_average ?? 0) / 20);
    pool.set(r.id, e);
    for (const g of r.genre_ids ?? []) genres.set(g, (genres.get(g) ?? 0) + w);
  }
  const ranked = [...pool.values()].sort((a, b) => b.score - a.score || (b.r.popularity ?? 0) - (a.r.popularity ?? 0));
  const poolPages = Math.ceil(ranked.length / PAGE);
  if (page <= poolPages) return { items: ranked.slice((page - 1) * PAGE, page * PAGE).map((e) => browseItem(type, e.r)), more: true };

  // Past the recommendations: popular titles in the genres you lean towards.
  const top = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  const date = type === "movie" ? "primary_release_date" : "first_air_date";
  const p: Record<string, string> = { sort_by: "popularity.desc", include_adult: "false", "vote_count.gte": "100", page: String(page - poolPages), [`${date}.lte`]: new Date().toISOString().slice(0, 10) };
  if (top.length) p.with_genres = top.join("|");
  const d = await tmdb(`/discover/${type}`, p, 3600);
  const items = ((d.results ?? []) as any[]).filter((r) => r.poster_path && !own.has(`${type}:${r.id}`) && !pool.has(r.id)).map((r) => browseItem(type, r));
  return { items, more: page - poolPages < Math.min(d.total_pages ?? 1, 200) };
}
