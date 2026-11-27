import { genreFit, kwFit, langFit, type Cand, type How, type Profile } from "./foryou-rank";
import { daysUntil } from "./episodes";
import type { MediaType } from "./types";

/**
 * "Coming up that you may like": unreleased films and new series that are not in your library yet. Pure (no fetching), so the
 * ranking is unit tested; the data comes from `upcoming-picks.ts`.
 * What counts most is a CONNECTION to what you watched: the next film of a franchise you watched, or new work from a director,
 * creator or actor you follow (in several of your titles, or one you rated highly). Taste fit (genres, themes, language) and how
 * anticipated a title is only order the rest. Unreleased titles have no votes, so there is no quality term.
 */

export type Role = "director" | "creator" | "actor";
/** A person you follow: in `titles` of your library (strongest first), with `score` = sum of seed weight x billing. */
export interface Followed { id: number; name: string; role: Role; score: number; titles: string[] }
/** A franchise you watched: its name ("Dune") and the library film it is known by. */
export interface Saga { name: string; t: string; how: How }

/** An unreleased title in the pool. `date` is YYYY-MM-DD. */
export interface UpCand extends Cand { date: string; saga?: Saga; via?: Followed[] }

/** How far ahead picks are looked for, in days. */
export const PICK_HORIZON = 365;

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Who made / leads a title, from a TMDB detail record fetched with credits: directors (films), creators (series), top-billed cast. */
export function creditsOf(d: any, type: MediaType): { id: number; name: string; role: Role; k: number }[] {
  const out: { id: number; name: string; role: Role; k: number }[] = [];
  const seen = new Set<number>();
  const add = (id: unknown, name: unknown, role: Role, k: number) => { if (typeof id === "number" && !seen.has(id)) { seen.add(id); out.push({ id, name: String(name ?? ""), role, k }); } };
  if (type === "movie") for (const c of (d?.credits?.crew ?? []) as any[]) { if (c.job === "Director") add(c.id, c.name, "director", 1); }
  else for (const c of (d?.created_by ?? []) as any[]) add(c.id, c.name, "creator", 1);
  const cast: any[] = (type === "movie" ? d?.credits?.cast : d?.aggregate_credits?.cast) ?? [];
  [...cast].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, 5).forEach((c, i) => add(c.id, c.name, "actor", i < 2 ? 1 : 0.6));
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The people you follow, strongest first: in at least two of your titles, or the director/creator/lead of one you loved
 * (weight >= 2.4). `seeds`: library titles with their weight (seedWeight) and credits.
 */
export function followedPeople(seeds: { title: string; w: number; people: { id: number; name: string; role: Role; k: number }[] }[], max = 12): Followed[] {
  const by = new Map<number, Followed & { n: number; best: number }>();
  for (const s of [...seeds].filter((x) => x.w > 0).sort((a, b) => b.w - a.w)) for (const p of s.people) {
    const f = by.get(p.id) ?? { id: p.id, name: p.name, role: p.role, score: 0, titles: [], n: 0, best: 0 };
    // Behind the camera wins: someone who directed one of your titles and acted in another is followed as a director.
    if (p.role !== "actor") f.role = p.role;
    f.score += s.w * p.k; f.n += 1; f.best = Math.max(f.best, s.w * p.k);
    if (!f.titles.includes(s.title)) f.titles.push(s.title);
    by.set(p.id, f);
  }
  return [...by.values()].filter((f) => f.n >= 2 || f.best >= 2.4).sort((a, b) => b.score - a.score).slice(0, max)
    .map(({ id, name, role, score, titles }) => ({ id, name, role, score, titles }));
}

/** 0..1: how strongly following someone says "you will want this". Behind the camera counts more than one actor. */
export const followStrength = (f: Followed) => Math.min(1, f.score / 5) * (f.role === "actor" ? 0.8 : 1);

/** 0..1: TMDB popularity on a log scale. A big release sits around 50-300 before it is out. */
export const hype = (pop: number) => Math.max(0, Math.min(1, Math.log10(1 + pop) / 2.4));

/** Has a franchise or a followed person behind it: the picks the Library shows. */
export const isConnected = (c: Pick<UpCand, "saga" | "via">) => !!c.saga || !!c.via?.length;

/** Higher is better. A connection (saga, followed people) always outranks a title that only fits your genres. */
export function scoreUpcoming(c: UpCand, like: Profile, dislike: Profile): number {
  const people = 1 - (c.via ?? []).reduce((acc, f) => acc * (1 - followStrength(f)), 1);
  const fit = 0.6 * genreFit(like, c.genres) + 0.25 * kwFit(like, c.kw ?? []) + 0.15 * langFit(like, c.lang);
  const away = 0.6 * genreFit(dislike, c.genres) + 0.4 * kwFit(dislike, c.kw ?? []);
  return (c.saga ? 1.3 : 0) + (people ? 0.5 + 0.7 * people : 0) + 0.3 * fit + 0.15 * hype(c.pop) - 0.3 * away;
}

/** Unreleased, dated, inside the horizon and not in the library: the only titles that may be suggested. */
export function isPickable(c: { date: string }, key: string, own: Set<string>, today: string): boolean {
  if (own.has(key) || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return false;
  const n = daysUntil(c.date, today);
  return n >= 1 && n <= PICK_HORIZON;
}

/** Best first; ties go to the sooner release. */
export function rankUpcoming<T extends UpCand>(pool: T[], like: Profile, dislike: Profile): { c: T; score: number }[] {
  return pool.map((c) => ({ c, score: scoreUpcoming(c, like, dislike) })).sort((a, b) => b.score - a.score || a.c.date.localeCompare(b.c.date));
}

/** Completes "…, which <phrase>." */
const PHRASE: Record<How, string> = { loved: "you rated highly", watched: "you watched", watching: "you are watching", partial: "you watched part of", must: "is on your must-watch list", want: "is on your to-watch list" };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const ROLE: Record<Role, string> = { director: "director of", creator: "creator of", actor: "" };
/** "Christopher Nolan (director of Oppenheimer and Inception)", "Zendaya (Dune and Challengers; 4 of your titles)". */
function personText(f: Followed): string {
  const of = list(f.titles.slice(0, 2)), more = f.titles.length > 2 ? `; ${f.titles.length} of your titles` : "";
  return `${f.name} (${ROLE[f.role] ? `${ROLE[f.role]} ` : ""}${of}${more})`;
}

/** The one-line reason a pick is shown (hover text in Browse). */
export function upWhy(c: Pick<UpCand, "saga" | "via">, genres: string[]): string {
  const via = [...(c.via ?? [])].sort((a, b) => followStrength(b) - followStrength(a));
  const lead = via.find((f) => f.role !== "actor"), cast = via.filter((f) => f.role === "actor").slice(0, 2);
  const bits: string[] = [];
  if (c.saga) bits.push(`New in the ${c.saga.name} franchise, after ${c.saga.t}, which ${PHRASE[c.saga.how]}`);
  if (lead) bits.push(`From ${personText(lead)}`);
  if (cast.length) bits.push(`With ${list(cast.map(personText))}`);
  if (bits.length) return `${bits.join(". ")}.`;
  if (genres.length) return `Fits your taste for ${list(genres.slice(0, 2))}.`;
  return "One of the most anticipated releases.";
}

/** The short form for a Library row: "Next in Dune", "From Christopher Nolan", "With Zendaya", "Drama, Thriller". */
export function upWhyShort(c: Pick<UpCand, "saga" | "via">, genres: string[]): string {
  const via = [...(c.via ?? [])].sort((a, b) => followStrength(b) - followStrength(a));
  const lead = via.find((f) => f.role !== "actor");
  if (c.saga) return `Next in ${c.saga.name}`;
  if (lead) return `From ${lead.name}`;
  if (via.length) return `With ${list(via.slice(0, 2).map((f) => f.name))}`;
  if (genres.length) return genres.slice(0, 2).join(", ");
  return "Anticipated";
}
