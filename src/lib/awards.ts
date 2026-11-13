import { cache } from "react";
import { unstable_cache } from "next/cache";

/** One award (or nomination) as Wikidata records it: "Best Visual Effects" at the Academy Awards, 2015. */
export interface AwardEntry { category: string; year: string; /** People Wikidata credits with it for this title (the winner of "Best Supporting Actress"). */ who?: string[] }
/** Everything one award body gave this title, e.g. all the Oscars: what it won and what it was only nominated for. */
export interface AwardGroup { name: string; won: AwardEntry[]; nominated: AwardEntry[] }
export interface Awards {
  oscars: { won: number; nominated: number };
  emmys: { won: number; nominated: number };
  /** Wins and nominations outside the Oscars (and, for the compact summary, outside the Emmys). */
  otherWon: number;
  groups: AwardGroup[];
}

const OSCAR = "Academy Award";
const EMMY = "Primetime Emmy Award";

/** "Academy Award for Best Sound" -> ["Academy Award", "Best Sound"]; "Palme d'Or" -> ["Palme d'Or", ""]. */
function splitLabel(label: string): [string, string] {
  const i = label.indexOf(" for ");
  return i < 0 ? [label, ""] : [label.slice(0, i), label.slice(i + 5)];
}

/** Display name of an award body: the Oscars by their everyday name, "Foo Award" as "Foo Awards". */
export function awardName(family: string): string {
  if (family === OSCAR) return "Oscars";
  if (family === EMMY) return "Primetime Emmys";
  return /\bAward$/.test(family) ? `${family}s` : family;
}

const QUERY = (imdb: string) => `
SELECT ?awLabel ?kind ?year WHERE {
  ?f wdt:P345 "${imdb}".
  { ?f p:P166 ?s. ?s ps:P166 ?aw. BIND("won" AS ?kind) } UNION { ?f p:P1411 ?s. ?s ps:P1411 ?aw. BIND("nom" AS ?kind) }
  OPTIONAL { ?s pq:P585 ?d. BIND(YEAR(?d) AS ?year) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 400`;

/** Same awards, but from the people's side: who won or was nominated for this title. */
const WHO_QUERY = (imdb: string) => `
SELECT ?pLabel ?awLabel ?kind ?year WHERE {
  ?f wdt:P345 "${imdb}".
  { ?p p:P166 ?s. ?s ps:P166 ?aw. BIND("won" AS ?kind) } UNION { ?p p:P1411 ?s. ?s ps:P1411 ?aw. BIND("nom" AS ?kind) }
  ?s pq:P1686 ?f.
  OPTIONAL { ?s pq:P585 ?d. BIND(YEAR(?d) AS ?year) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 400`;

type Row = { awLabel?: { value: string }; kind: { value: string }; year?: { value: string } };
type WhoRow = Row & { pLabel?: { value: string } };

/** Pure shaping step (kept apart from the network call). A nomination that also appears as a win the same year is dropped. */
export function shapeAwards(rows: Row[], people: WhoRow[] = []): Awards {
  const who = new Map<string, string[]>();
  for (const r of people) {
    const n = r.pLabel?.value ?? "";
    if (!n || /^Q\d+$/.test(n)) continue;
    const k = `${r.kind.value}|${r.awLabel?.value ?? ""}|${r.year?.value ?? ""}`;
    const l = who.get(k) ?? [];
    if (!l.includes(n)) l.push(n);
    who.set(k, l);
  }
  const by = new Map<string, AwardGroup>();
  const wonKeys = new Set<string>();
  const seen = new Set<string>();
  const sorted = [...rows].sort((a, b) => (a.kind.value === "won" ? 0 : 1) - (b.kind.value === "won" ? 0 : 1));
  for (const r of sorted) {
    const label = r.awLabel?.value ?? "";
    // Unlabelled items come back as Q-ids; skip them.
    if (!label || /^Q\d+$/.test(label)) continue;
    const won = r.kind.value === "won";
    const year = r.year?.value ?? "";
    const k = `${label}|${year}`;
    if (won) wonKeys.add(k); else if (wonKeys.has(k)) continue;
    const dupe = `${r.kind.value}|${k}`;
    if (seen.has(dupe)) continue;
    seen.add(dupe);
    const [family, category] = splitLabel(label);
    const g = by.get(family) ?? { name: family, won: [], nominated: [] };
    const names = who.get(`${r.kind.value}|${label}|${year}`);
    (won ? g.won : g.nominated).push(names?.length ? { category, year, who: names } : { category, year });
    by.set(family, g);
  }
  const byYear = (a: AwardEntry, b: AwardEntry) => a.year.localeCompare(b.year) || a.category.localeCompare(b.category);
  const groups = [...by.values()];
  for (const g of groups) { g.won.sort(byYear); g.nominated.sort(byYear); }
  // Oscars first, then whoever has the most wins, then the most nominations.
  groups.sort((a, b) => (b.name === OSCAR ? 1 : 0) - (a.name === OSCAR ? 1 : 0) || b.won.length - a.won.length || b.nominated.length - a.nominated.length);
  const count = (fam: string) => { const g = by.get(fam); return { won: g?.won.length ?? 0, nominated: g?.nominated.length ?? 0 }; };
  const otherWon = groups.filter((g) => g.name !== OSCAR && g.name !== EMMY).reduce((n, g) => n + g.won.length, 0);
  return { oscars: count(OSCAR), emmys: count(EMMY), otherWon, groups: groups.map((g) => ({ ...g, name: g.name })) };
}

async function sparql<T>(query: string): Promise<T[]> {
  const u = new URL("https://query.wikidata.org/sparql");
  u.searchParams.set("query", query);
  u.searchParams.set("format", "json");
  const r = await fetch(u, { headers: { accept: "application/sparql-results+json", "user-agent": "Typecast/1.0 (personal film and TV tracker)" }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`Wikidata answered ${r.status}`);
  const j = await r.json() as { results?: { bindings?: T[] } };
  return j.results?.bindings ?? [];
}

async function fetchAwards(imdb: string): Promise<Awards> {
  // The names are a bonus: if that second query fails the awards still show, just without who.
  const [rows, people] = await Promise.all([sparql<Row>(QUERY(imdb)), sparql<WhoRow>(WHO_QUERY(imdb)).catch(() => [] as WhoRow[])]);
  return shapeAwards(rows, people);
}

/** A week in Next's data cache per title. Errors throw, so they are not cached. */
const cached = unstable_cache(fetchAwards, ["awards-wikidata-v2"], { revalidate: 60 * 60 * 24 * 7 });

/** Awards for a title by IMDb id, or null when unknown or Wikidata cannot be reached (the UI simply shows nothing). Once per request. */
export const getAwards = cache(async (imdb: string | null): Promise<Awards | null> => {
  if (!imdb || !/^tt\d+$/.test(imdb)) return null;
  try { return await cached(imdb); } catch { return null; }
});

export const hasAwards = (a: Awards | null): a is Awards => !!a && a.groups.length > 0;
