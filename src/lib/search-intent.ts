/**
 * What a search is mostly about, and how to lay the results out. Pure: used by the search box (with the user's library) and by the
 * search API (without it, to decide whether to try a spelling suggestion). TMDB's person popularity is on a much smaller scale than
 * a title's (Keanu Reeves is 8.9, The Matrix 38), so each kind has its own cut-offs.
 */
import type { SearchHit } from "./types";

export type PersonHit = Extract<SearchHit, { kind: "person" }>;
export type TitleHit = Extract<SearchHit, { kind: "title" }>;
export type Intent = "title" | "person" | "mixed" | "unclear";
/** What the library knows about a title key (a `Mark` fits). */
export type LibLookup = (key: string) => { status: string; rich?: boolean } | undefined;

export const CUT = {
  /** Person popularity: famous opens as the Top result, notable is worth a row, under `minPerson` is hidden. */
  famousPerson: 5, notablePerson: 2, minPerson: 1,
  /** A title is big at this popularity or vote count, and only if its name starts with the query. */
  bigPop: 10, bigVotes: 5000,
  /** A title with fewer votes AND lower popularity is weak and folds under "More". */
  weakVotes: 5, weakPop: 5,
  maxTitles: 12, maxTitlesWithPerson: 6, maxPeople: 6,
};

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/** Normalised, without a leading "the / a / an" ("The Matrix" is "matrix"). */
const core = (s: string) => norm(s).replace(/^(the|a|an) (?=.)/, "");

/** 4 exact, 3 starts with, 2 whole words inside, 1 every query word starts a word of the name, 0 none. */
export function nameTier(q: string, name: string): 0 | 1 | 2 | 3 | 4 {
  const a = core(q), b = core(name);
  if (!a || !b) return 0;
  if (a === b) return 4;
  if (b.startsWith(a)) return 3;
  if ((" " + b + " ").includes(" " + a + " ")) return 2;
  const bw = b.split(" ");
  return a.split(" ").every((w) => bw.some((x) => x.startsWith(w))) ? 1 : 0;
}

/** A person's name tier: a half-typed name ("hitchcoc" for Alfred Hitchcock) counts as a word match for a single word of 4+ letters, so people can be found while typing. */
export function personTier(q: string, name: string): 0 | 1 | 2 | 3 | 4 {
  const t = nameTier(q, name);
  return t === 1 && !core(q).includes(" ") && core(q).length >= 4 ? 2 : t;
}

const isPerson = (h: SearchHit): h is PersonHit => h.kind === "person";
const isTitle = (h: SearchHit): h is TitleHit => h.kind === "title";

export interface Layout {
  intent: Intent;
  /** The best match, shown first and opened by Enter. Null when the search is unclear. */
  top: SearchHit | null;
  /** Mixed searches only: the best of the other kind, one line under the top result. */
  also: SearchHit | null;
  /** People for the strip below ("Also named …" when a person leads). */
  people: PersonHit[];
  titles: TitleHit[];
  /** Weaker title matches, behind a "more" button. */
  folded: TitleHit[];
}

export function layoutSearch(q: string, hits: SearchHit[], lib: LibLookup = () => undefined): Layout {
  const tokens = norm(q).split(" ").filter(Boolean).length;
  const persons = hits.filter(isPerson).map((h) => ({ h, tier: personTier(q, h.name), pop: h.pop ?? 0 }));
  const titles = hits.filter(isTitle).map((h, i) => ({ h, i, tier: nameTier(q, h.title), pop: h.pop ?? 0, votes: h.votes ?? 0, mark: lib(h.key) }));

  // Hide people nobody knows, unless the whole name was typed or nothing else was found.
  let shown = persons.filter((p) => p.pop >= CUT.minPerson || (p.tier === 4 && tokens >= 2));
  if (!shown.length && !titles.length) shown = persons;

  // The best person is the most popular one the query names, not the one with the longest exact match.
  const named = shown.filter((p) => p.tier >= 2).sort((a, b) => b.pop - a.pop || b.tier - a.tier);
  const bestP = named[0];
  const famous = !!bestP && (bestP.pop >= CUT.famousPerson || (bestP.tier === 4 && tokens >= 2));

  const score = (t: { tier: number; pop: number }) => t.tier * 100 + Math.min(Math.log10(1 + t.pop) * 100, 300);
  const big = titles.filter((t) => t.tier >= 3 && (t.pop >= CUT.bigPop || t.votes >= CUT.bigVotes || !!t.mark)).sort((a, b) => score(b) - score(a) || a.i - b.i);
  let bestT = big[0];
  // A title you have marked that matches as well as the best one is the one you mean ("the office" with the UK version on your list).
  if (bestT) bestT = big.find((t) => t.mark && t.tier >= bestT.tier) ?? bestT;

  let intent: Intent = "unclear";
  if (famous && bestT) intent = "mixed"; else if (famous) intent = "person"; else if (bestT) intent = "title";

  let top: SearchHit | null = null, also: SearchHit | null = null;
  if (intent === "person") top = bestP.h;
  else if (intent === "title") top = bestT.h;
  else if (intent === "mixed") {
    const personFirst = bestP.tier > bestT.tier || (bestP.tier === bestT.tier && bestP.pop / CUT.famousPerson > bestT.pop / CUT.bigPop);
    top = personFirst ? bestP.h : bestT.h; also = personFirst ? bestT.h : bestP.h;
  }

  const used = new Set([top, also]);
  const rest = shown.filter((p) => !used.has(p.h));
  let people: PersonHit[];
  if (intent === "person") people = rest.filter((p) => p.tier >= 2).map((p) => p.h).slice(0, CUT.maxPeople);
  else if (intent === "unclear" && !titles.length) people = rest.map((p) => p.h).slice(0, CUT.maxPeople);
  else people = rest.filter((p) => p.pop >= CUT.notablePerson && p.tier >= 2).map((p) => p.h).slice(0, CUT.maxPeople);

  // Marked titles lead, but only among titles that really match the name, so a rated sequel never beats a better match.
  const libRank = (m: { rich?: boolean } | undefined) => (m ? (m.rich ? 2 : 1) : 0);
  const ordered = titles.filter((t) => !used.has(t.h)).sort((a, b) => (b.tier >= 2 ? libRank(b.mark) : 0) - (a.tier >= 2 ? libRank(a.mark) : 0) || a.i - b.i);
  const solid = (t: (typeof ordered)[number]) => !!t.mark || t.votes >= CUT.weakVotes || t.pop >= CUT.weakPop;
  const keep = intent === "person" ? (t: (typeof ordered)[number]) => t.tier >= 2 && solid(t) : solid;
  const cap = intent === "person" ? CUT.maxTitlesWithPerson : CUT.maxTitles;
  const good = ordered.filter(keep);
  return { intent, top, also, people, titles: good.slice(0, cap).map((t) => t.h), folded: [...good.slice(cap), ...ordered.filter((t) => !keep(t))].map((t) => t.h) };
}

/** Titles of a person's known-for list that the user has seen (on the watchlist only does not count, as in the cast list). */
export function youKnowFrom(p: PersonHit, lib: LibLookup): string[] {
  return p.knownFor.filter((_, i) => { const k = p.knownKeys?.[i]; const m = k ? lib(k) : undefined; return !!m && m.status !== "watchlist"; });
}

/** A film collection found by name: `pop` / `votes` are those of its biggest film. */
export interface CollHit { id: number; name: string; pop?: number; votes?: number; items: { key: string }[] }

/**
 * Collections worth showing for a search. A franchise nobody has heard of ("The Roaming Reporter and Rookie Detective Series" for
 * "rookie") must not push the title you meant down, so a collection needs a well-known film or one of its films on your lists.
 * When nothing else matched at all, a weak one is better than an empty page.
 */
export function pickCollections<C extends CollHit>(colls: C[], lay: Layout | null, lib: LibLookup = () => undefined): C[] {
  const strong = (c: C) => (c.votes ?? 0) >= 1000 || (c.pop ?? 0) >= 20 || c.items.some((i) => !!lib(i.key));
  const keep = colls.filter(strong);
  if (keep.length || !lay) return keep;
  return lay.top || lay.titles.length ? [] : colls;
}
