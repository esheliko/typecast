import type { CastMember } from "./types";

/**
 * The blocks of a title's page that the user can reorder or hide. Shared by the title page and the
 * browse "glance", so one saved preference (profiles.detail_order) drives both.
 */
export const DETAIL_IDS = ["director", "writer", "cinematography", "composer", "editor", "producer", "cast_main", "cast_rest", "crew_rest"] as const;
export type DetailId = (typeof DETAIL_IDS)[number];
/** The sections that are made of crew, as opposed to the two cast sections. */
export type CrewId = Exclude<DetailId, "cast_main" | "cast_rest">;
export type CrewBy = Record<CrewId, CastMember[]>;

/** Order (and visibility) used until the user picks their own: what the page showed before this was customizable. */
export const DEFAULT_ORDER: DetailId[] = ["director", "cast_main", "cast_rest"];
/** How many billed actors count as "main cast"; everyone after them is "rest of cast". */
export const MAIN_CAST = 8;

export const DETAIL_LABEL: Record<DetailId, string> = {
  director: "Director", writer: "Writers", cinematography: "Cinematography", composer: "Composer", editor: "Editor",
  producer: "Producers", cast_main: "Main cast", cast_rest: "Rest of cast", crew_rest: "Rest of crew",
};
/** Series have a creator where films have a director. */
export const detailLabel = (id: DetailId, type: "movie" | "tv") => (id === "director" && type === "tv" ? "Created by" : DETAIL_LABEL[id]);

/** "Music by …": the one-line credit shown under a title's name or in a browse glance. */
export const BYLINE: Record<CrewId, string> = {
  director: "Directed by", writer: "Written by", cinematography: "Photography by", composer: "Music by", editor: "Edited by", producer: "Produced by", crew_rest: "Crew",
};
export const bylineLabel = (id: CrewId, type: "movie" | "tv") => (id === "director" && type === "tv" ? "Created by" : BYLINE[id]);

export const isCrewId = (id: DetailId): id is CrewId => id !== "cast_main" && id !== "cast_rest";

/** Whatever was stored (or nothing yet) -> a clean ordered list. `null` means "never customized", an empty list means "hide everything". */
export function normalizeDetails(v: unknown): DetailId[] {
  if (!Array.isArray(v)) return [...DEFAULT_ORDER];
  const known = new Set<string>(DETAIL_IDS);
  const out: DetailId[] = [];
  for (const x of v) if (typeof x === "string" && known.has(x) && !out.includes(x as DetailId)) out.push(x as DetailId);
  return out;
}

// TMDB job names that belong to each named crew section. Everything not listed lands in crew_rest.
const JOBS: Record<Exclude<CrewId, "crew_rest" | "director">, string[]> = {
  writer: ["Writer", "Screenplay", "Teleplay", "Story", "Novel", "Author"],
  cinematography: ["Director of Photography", "Cinematography"],
  composer: ["Original Music Composer", "Composer", "Music"],
  editor: ["Editor"],
  producer: ["Producer", "Executive Producer"],
};
const CAP: Record<CrewId, number> = { director: 4, writer: 5, cinematography: 4, composer: 4, editor: 4, producer: 6, crew_rest: 30 };

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sort TMDB's crew list into the sections above. Films give `{ job }` per entry, series (aggregate credits)
 * give `{ jobs: [{ job }] }`. Series have no single director, so their "director" section is the creators.
 */
export function shapeCrew(type: "movie" | "tv", crew: any[] = [], createdBy: any[] = []): CrewBy {
  const maps = Object.fromEntries((Object.keys(CAP) as CrewId[]).map((k) => [k, new Map<number, CastMember>()])) as Record<CrewId, Map<number, CastMember>>;
  const put = (sec: CrewId, c: any, role: string) => {
    const m = maps[sec]; const have = m.get(c.id);
    if (have) { if (role && !have.role.split(", ").includes(role)) have.role += `, ${role}`; return; }
    m.set(c.id, { id: c.id, name: c.name, photo: c.profile_path ?? null, role });
  };
  if (type === "tv") for (const c of createdBy) put("director", c, "Creator");
  const named = Object.keys(JOBS) as (keyof typeof JOBS)[];
  for (const c of crew) {
    const jobs: string[] = (c.jobs ? c.jobs.map((j: any) => j.job) : [c.job]).filter(Boolean);
    const used = new Set<string>();
    if (type === "movie" && jobs.includes("Director")) { put("director", c, "Director"); used.add("Director"); }
    for (const sec of named) {
      const hit = jobs.filter((j) => JOBS[sec].includes(j));
      if (hit.length) { put(sec, c, hit.join(", ")); hit.forEach((j) => used.add(j)); }
    }
    const rest = jobs.filter((j) => !used.has(j) && !(type === "tv" && j === "Director"));
    if (rest.length) put("crew_rest", c, rest.slice(0, 2).join(", "));
  }
  return Object.fromEntries((Object.keys(CAP) as CrewId[]).map((k) => [k, [...maps[k].values()].slice(0, CAP[k])])) as CrewBy;
}
