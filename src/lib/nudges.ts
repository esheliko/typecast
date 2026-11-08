import { DECADES, type BrowseQuery } from "./browse";
import { genreList, tmdb } from "./tmdb";
import type { LibItem, MediaType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A suggested direction for Browse: a label, why it is suggested, and the filters it applies. */
export interface Nudge { id: string; label: string; why: string; patch: Partial<BrowseQuery> }

const MAX_SEEDS = 24;
const KINDS = { director: 1.4, composer: 1.4, cast: 1, studio: 1.1, theme: 0.9, genre: 0.5 } as const;
type Kind = keyof typeof KINDS;
interface Facet { kind: Kind; id: number; name: string; type: MediaType; score: number; n: number; titles: string[] }

/** Taste signal of one library title: loved counts most, plain watched in the middle, low-rated not at all. */
function weight(l: LibItem): number {
  if (l.status === "watched" || l.status === "watching" || l.status === "partial") return l.rating >= 4 ? 3 : l.rating > 0 && l.rating <= 2 ? 0 : 1.5;
  return l.priority === "must" ? 1 : 0;
}

async function facetsOf(l: LibItem): Promise<{ kind: Kind; id: number; name: string }[]> {
  const tv = l.type === "tv";
  const d = await tmdb(`/${l.type}/${l.id}`, { append_to_response: `${tv ? "aggregate_credits" : "credits"},keywords` }, 24 * 3600).catch(() => null);
  if (!d) return [];
  const out: { kind: Kind; id: number; name: string }[] = [];
  const credits = tv ? d.aggregate_credits : d.credits;
  for (const c of (credits?.cast ?? []).slice(0, tv ? 4 : 5)) out.push({ kind: "cast", id: c.id, name: c.name });
  for (const c of credits?.crew ?? []) {
    const jobs: string[] = tv ? (c.jobs ?? []).map((j: any) => j.job) : [c.job];
    if (jobs.includes("Director")) out.push({ kind: "director", id: c.id, name: c.name });
    if (jobs.some((j) => /composer/i.test(j))) out.push({ kind: "composer", id: c.id, name: c.name });
  }
  for (const c of d.created_by ?? []) out.push({ kind: "director", id: c.id, name: c.name });
  for (const c of d.production_companies ?? []) out.push({ kind: "studio", id: c.id, name: c.name });
  for (const k of (tv ? d.keywords?.results : d.keywords?.keywords) ?? []) out.push({ kind: "theme", id: k.id, name: k.name });
  for (const g of d.genres ?? []) out.push({ kind: "genre", id: g.id, name: g.name });
  return out;
}

const patchOf = (f: Facet): Partial<BrowseQuery> => {
  const t = { id: f.id, name: f.name };
  switch (f.kind) {
    case "director": case "composer": case "cast": return { people: [t] };
    case "studio": return { companies: [t] };
    case "theme": return { keywords: [t] };
    case "genre": return { type: f.type, genres: [f.id] };
  }
};

/**
 * Directions worth trying, read off the watched history: the people, studios, themes and genres that keep turning up
 * in what you watched (so "more of this"), plus decades and genres your history barely touches (so "something different").
 * Every suggestion is a Browse filter set, so a tap just applies it. `round` rotates through the wider pool, so the refresh button shows new ones.
 */
export async function nudges(lib: LibItem[], round = 0): Promise<Nudge[]> {
  const seeds = lib.map((l) => ({ l, w: weight(l) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w || b.l.added - a.l.added).slice(0, MAX_SEEDS);
  if (seeds.length < 4) return [];
  const per = await Promise.all(seeds.map((s) => facetsOf(s.l)));

  const tally = new Map<string, Facet>();
  seeds.forEach((s, i) => {
    const seen = new Set<string>();
    for (const f of per[i]) {
      const k = `${f.kind}:${f.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const e = tally.get(k) ?? { ...f, type: s.l.type, score: 0, n: 0, titles: [] };
      e.score += s.w * KINDS[f.kind]; e.n++; e.titles.push(s.l.title);
      tally.set(k, e);
    }
  });

  // "More of what you love": needs at least two of your titles in common, and no more than two per kind so it stays varied.
  const picked: Facet[] = [];
  const perKind: Record<string, number> = {};
  const used = new Set<string>();
  for (const f of [...tally.values()].filter((f) => f.n >= 2).sort((a, b) => b.score - a.score)) {
    const sig = f.titles.join("|");
    if ((perKind[f.kind] ?? 0) >= 4 || used.has(sig)) continue; // same set of titles = same finding (e.g. an actor who is also the director)
    used.add(sig); perKind[f.kind] = (perKind[f.kind] ?? 0) + 1; picked.push(f);
    if (picked.length >= 12) break;
  }
  // Interleave kinds so any window of four stays varied, then rotate by round.
  const byKind = new Map<string, Facet[]>();
  for (const f of picked) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  const mixed: Facet[] = [];
  for (let i = 0; mixed.length < picked.length; i++) for (const l of byKind.values()) if (l[i]) mixed.push(l[i]);
  const start = mixed.length > 4 ? (round * 4) % mixed.length : 0;
  const window = mixed.length > 4 ? Array.from({ length: 4 }, (_, i) => mixed[(start + i) % mixed.length]) : mixed;
  const out: Nudge[] = window.map((f) => ({
    id: `${f.kind}:${f.id}`, label: f.name,
    why: `${f.n} of your watched titles${f.kind === "genre" ? " are " + f.name : f.kind === "theme" ? " share this theme" : " involve " + f.name} (${f.titles.slice(0, 3).join(", ")}${f.n > 3 ? "…" : ""})`,
    patch: patchOf(f),
  }));

  // "Something different": decades and genres the history leaves out. Aimed at well-rated titles so the detour is worth it.
  const years = lib.map((l) => parseInt(l.year, 10)).filter((y) => y > 1800);
  if (years.length >= 8) {
    const gaps = DECADES.map((d) => ({ d, share: years.filter((y) => y >= (d.from ? +d.from : 0) && y <= +d.to).length / years.length })).filter((x) => x.share < 0.1).sort((a, b) => a.share - b.share);
    const dStart = gaps.length > 2 ? (round * 2) % gaps.length : 0;
    const shownGaps = gaps.length > 2 ? [gaps[dStart], gaps[(dStart + 1) % gaps.length]] : gaps;
    for (const { d, share } of shownGaps) out.push({ id: `decade:${d.label}`, label: d.label, why: `Only ${Math.round(share * 100)}% of your library is from the ${d.label}`, patch: { from: d.from, to: d.to, minRating: 7 } });
  }
  const have = new Set(per.flat().filter((f) => f.kind === "genre").map((f) => f.id));
  const movieGenres = await genreList("movie").catch(() => []);
  const unseen = movieGenres.filter((g) => !have.has(g.id) && !["TV Movie", "Documentary"].includes(g.name));
  if (unseen.length) {
    const g = unseen[(seeds.length * 7 + (lib.length % 5) + round * 3) % unseen.length];
    out.push({ id: `gap-genre:${g.id}`, label: g.name, why: `You haven't watched any ${g.name} lately`, patch: { type: "movie", genres: [g.id], minRating: 7 } });
  }
  return out;
}
