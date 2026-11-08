import { cache } from "react";
import { unstable_cache } from "next/cache";
import { tmdb } from "@/lib/tmdb";
import type { CrewBy, CrewId } from "@/lib/details";
import type { CastMember } from "@/lib/types";

/**
 * TMDB is missing credits for many titles (often a series' composer, cinematographer or editor). Wikidata, found through the
 * IMDb id, usually has them, so empty crew sections are filled from there. People are matched back to TMDB by exact name so
 * their rows still link to a person page; anyone who can't be matched is left out.
 */
const PROPS: Record<Exclude<CrewId, "crew_rest">, { p: string; role: string }[]> = {
  director: [{ p: "P57", role: "Director" }, { p: "P170", role: "Creator" }],
  writer: [{ p: "P58", role: "Writer" }],
  cinematography: [{ p: "P344", role: "Cinematography" }],
  composer: [{ p: "P86", role: "Composer" }],
  editor: [{ p: "P1040", role: "Editor" }],
  producer: [{ p: "P162", role: "Producer" }],
};
const SECTIONS = Object.keys(PROPS) as (keyof typeof PROPS)[];
const PER_SECTION = 3;
type Fill = Partial<Record<CrewId, CastMember[]>>;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function names(imdb: string, want: string[]): Promise<Record<string, string[]>> {
  const props = want.flatMap((s) => PROPS[s as keyof typeof PROPS].map((x) => x.p));
  const q = `SELECT DISTINCT ?p ?vLabel WHERE { ?f wdt:P345 "${imdb}". VALUES ?p { ${props.map((x) => `wdt:${x}`).join(" ")} } ?f ?p ?v. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 60`;
  const u = new URL("https://query.wikidata.org/sparql");
  u.searchParams.set("query", q); u.searchParams.set("format", "json");
  const r = await fetch(u, { headers: { accept: "application/sparql-results+json", "user-agent": "Typecast/1.0 (personal film and TV tracker)" }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`Wikidata answered ${r.status}`);
  const j = await r.json() as { results?: { bindings?: { p: { value: string }; vLabel?: { value: string } }[] } };
  const out: Record<string, string[]> = {};
  for (const b of j.results?.bindings ?? []) {
    const prop = b.p.value.split("/").pop() ?? "";
    const n = b.vLabel?.value ?? "";
    if (!n || /^Q\d+$/.test(n)) continue;
    const list = (out[prop] ??= []);
    if (!list.includes(n)) list.push(n);
  }
  return out;
}

async function person(name: string): Promise<{ id: number; photo: string | null } | null> {
  const d = await tmdb("/search/person", { query: name, include_adult: "false" }, 7 * 24 * 3600);
  const hit = (d.results ?? []).find((r: any) => String(r.name).toLowerCase() === name.toLowerCase());
  return hit ? { id: hit.id, photo: hit.profile_path ?? null } : null;
}

async function fetchFill(imdb: string, want: string): Promise<Fill> {
  const sections = want.split(",") as (keyof typeof PROPS)[];
  const byProp = await names(imdb, sections);
  const out: Fill = {};
  for (const sec of sections) {
    const seen = new Set<string>();
    const list: { name: string; role: string }[] = [];
    for (const { p, role } of PROPS[sec]) for (const n of byProp[p] ?? []) if (!seen.has(n)) { seen.add(n); list.push({ name: n, role }); }
    const people = await Promise.all(list.slice(0, PER_SECTION + 2).map(async (x) => ({ x, hit: await person(x.name).catch(() => null) })));
    const got = people.filter((p) => p.hit).slice(0, PER_SECTION).map(({ x, hit }): CastMember => ({ id: hit!.id, name: x.name, photo: hit!.photo, role: x.role }));
    if (got.length) out[sec] = got;
  }
  return out;
}
const cached = unstable_cache(fetchFill, ["crew-fill-v1"], { revalidate: 60 * 60 * 24 * 7 });

/** Which crew sections TMDB left empty (crew_rest is never filled). */
export const missingCrew = (crewBy: CrewBy) => SECTIONS.filter((s) => !crewBy[s].length);

/** `crewBy` with its empty sections filled from Wikidata when possible. Returns it unchanged when complete, unknown or unreachable. */
export const fillCrew = cache(async (type: "movie" | "tv", imdb: string | null, crewBy: CrewBy): Promise<CrewBy> => {
  const miss = missingCrew(crewBy);
  if (!miss.length || !imdb || !/^tt\d+$/.test(imdb)) return crewBy;
  try {
    const f = await cached(imdb, miss.join(","));
    const out = { ...crewBy };
    for (const s of miss) {
      // A series' "director" section means its creators, so episode directors don't belong there.
      const list = s === "director" && type === "tv" ? f.director?.filter((p) => p.role === "Creator") : f[s];
      if (list?.length) out[s] = list;
    }
    return out;
  } catch { return crewBy; }
});
