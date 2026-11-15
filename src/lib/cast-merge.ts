import { normName } from "@/lib/tvmaze";

/**
 * Extra cast for a series from sources that are independent of TMDB (TVmaze, TheTVDB). TMDB stays primary: another source only ADDS
 * people TMDB lacks, never changes a TMDB row. Pure helpers here (unit tested); the fetching is in `cast-sources.ts`.
 */
export interface SourcePerson { name: string; role: string; source: "tvmaze" | "tvdb" }
export interface PersonHit { id: number; name: string; profile_path?: string | null; known_for_department?: string; popularity?: number; known_for?: { id?: number; media_type?: string }[] }

const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/** TVmaze `/shows/<id>/cast` rows as source people. Pure. */
export function parseTvmazeCast(rows: unknown): SourcePerson[] {
  if (!Array.isArray(rows)) return [];
  const out: SourcePerson[] = [];
  for (const r of rows as { person?: { name?: string }; character?: { name?: string } }[]) {
    const name = clean(r?.person?.name);
    if (name) out.push({ name, role: clean(r?.character?.name), source: "tvmaze" });
  }
  return out;
}

/** TheTVDB `/series/<id>/extended` `characters` as source people: actors only (type 3), not directors, writers or artwork. Pure. */
export function parseTvdbCast(rows: unknown): SourcePerson[] {
  if (!Array.isArray(rows)) return [];
  const out: SourcePerson[] = [];
  for (const r of rows as { type?: number; peopleType?: string; personName?: string; name?: string }[]) {
    if (r?.type !== 3 && r?.peopleType !== "Actor") continue;
    const name = clean(r?.personName);
    if (name) out.push({ name, role: clean(r?.name), source: "tvdb" });
  }
  return out;
}

/** People the sources list that TMDB does not (by normalised name), each once; a role is taken from the first source that has one. Pure. */
export function missingCast(known: Iterable<string>, sources: SourcePerson[]): SourcePerson[] {
  const have = new Set([...known].map(normName));
  const out = new Map<string, SourcePerson>();
  for (const p of sources) {
    const k = normName(p.name);
    if (!k || have.has(k)) continue;
    const prev = out.get(k);
    if (!prev) out.set(k, p);
    else if (!prev.role && p.role) out.set(k, { ...prev, role: p.role });
  }
  return [...out.values()];
}

/**
 * Which TMDB person a source's name is. Only an exact (normalised) name match who acts counts. Several matches: the one whose
 * known-for list includes this series wins, otherwise the name is ambiguous and nobody is picked (never guess a namesake). Pure.
 */
export function matchPerson(name: string, results: PersonHit[], tvId: number): PersonHit | null {
  const k = normName(name);
  const same = results.filter((r) => normName(r.name) === k && (!r.known_for_department || r.known_for_department === "Acting"));
  if (same.length === 1) return same[0];
  const here = same.filter((r) => r.known_for?.some((x) => x.id === tvId && x.media_type !== "movie"));
  return here.length === 1 ? here[0] : null;
}

/* ---- TheTVDB login token: renewed by the server itself ---- */

export interface TokenStore { token: string | null; at: number }
/** TheTVDB tokens last about a month; renew well before that. */
export const TVDB_TOKEN_MAX_AGE_MS = 20 * 24 * 3600 * 1000;

/**
 * Runs `call` with a valid bearer token. The token is logged in for when missing or older than `TVDB_TOKEN_MAX_AGE_MS`, and one 401
 * (expired or revoked early) triggers a fresh login and one retry, so nobody ever has to paste a token. Pure apart from the injected functions.
 */
export async function withToken<T>(
  store: TokenStore,
  login: () => Promise<string>,
  call: (token: string) => Promise<{ status: number; body: T }>,
  now: () => number = Date.now,
): Promise<T> {
  const fresh = async () => { store.token = await login(); store.at = now(); return store.token; };
  const stale = !store.token || now() - store.at > TVDB_TOKEN_MAX_AGE_MS;
  let r = await call(stale ? await fresh() : store.token!);
  if (r.status === 401) r = await call(await fresh());
  if (r.status < 200 || r.status >= 300) throw new Error(`TheTVDB answered ${r.status}`);
  return r.body;
}
