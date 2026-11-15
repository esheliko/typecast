import { unstable_cache } from "next/cache";
import { tmdb } from "@/lib/tmdb";
import { matchPerson, missingCast, parseTvdbCast, parseTvmazeCast, withToken, type PersonHit, type SourcePerson, type TokenStore } from "@/lib/cast-merge";
import type { CastMember, Title } from "@/lib/types";

/**
 * More cast for a series than TMDB lists. TVmaze (free) and TheTVDB (needs `TVDB_API_KEY`; silently off without it) add people TMDB
 * lacks; each is matched to a TMDB person by exact name so the row opens a person page, and anyone unmatched is dropped. Series-level
 * only (name and character): no episode claims, so nothing here crosses the spoiler line. Server only; every failure is "nothing extra".
 */
const UA = { "user-agent": "Typecast/1.0 (personal film and TV tracker)", accept: "application/json" };
const MAX_ADDED = 40;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(6000) });
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
}

async function tvmazeCast(imdb: string | null, tvdb: number | null): Promise<SourcePerson[]> {
  try {
    const q = imdb ? `imdb=${imdb}` : tvdb ? `thetvdb=${tvdb}` : "";
    if (!q) return [];
    const show = (await getJson(`https://api.tvmaze.com/lookup/shows?${q}`)).body as { id?: number } | null;
    if (!show?.id) return [];
    return parseTvmazeCast((await getJson(`https://api.tvmaze.com/shows/${show.id}/cast`)).body);
  } catch { return []; }
}

const tvdbToken: TokenStore = { token: null, at: 0 };
async function tvdbCast(tvdb: number | null): Promise<SourcePerson[]> {
  const apikey = process.env.TVDB_API_KEY;
  if (!apikey || !tvdb) return [];
  try {
    const login = async () => {
      const r = await fetch("https://api4.thetvdb.com/v4/login", { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ apikey }), signal: AbortSignal.timeout(6000) });
      const t = r.ok ? ((await r.json()) as { data?: { token?: string } }).data?.token : null;
      if (!t) throw new Error(`TheTVDB login answered ${r.status}`);
      return t;
    };
    const body = await withToken(tvdbToken, login, (t) => getJson(`https://api4.thetvdb.com/v4/series/${tvdb}/extended`, { authorization: `Bearer ${t}` }));
    return parseTvdbCast((body as { data?: { characters?: unknown } } | null)?.data?.characters);
  } catch { return []; }
}

async function matched(p: SourcePerson, tvId: number): Promise<CastMember | null> {
  try {
    const d = await tmdb("/search/person", { query: p.name, include_adult: "false" }, 7 * 24 * 3600);
    const hit = matchPerson(p.name, (d.results ?? []) as PersonHit[], tvId);
    return hit ? { id: hit.id, name: hit.name, photo: hit.profile_path ?? null, role: p.role } : null;
  } catch { return null; }
}

/** Takes only the series id and the names/ids TMDB already lists, so the cache key is small and exact. */
async function fetchExtra(tvId: number, imdb: string | null, known: string): Promise<CastMember[]> {
  const ext = await tmdb(`/tv/${tvId}/external_ids`, {}, 24 * 3600).catch(() => null);
  const tvdb: number | null = ext?.tvdb_id ?? null;
  const [a, b] = await Promise.all([tvmazeCast(imdb ?? ext?.imdb_id ?? null, tvdb), tvdbCast(tvdb)]);
  const names = known ? known.split("\n") : [];
  const missing = missingCast(names, [...b, ...a]).slice(0, MAX_ADDED);
  const people = await Promise.all(missing.map((p) => matched(p, tvId)));
  const seen = new Set<number>();
  return people.filter((p): p is CastMember => !!p && !seen.has(p.id) && !!seen.add(p.id));
}
const cached = unstable_cache(fetchExtra, ["cast-extra-v1"], { revalidate: 60 * 60 * 24 });

/**
 * People other sources list for a series that TMDB's cast (`people` + `extras`) does not. Raced against a short timer so the cast
 * never waits long on a cold cache (the lookup still completes and is cached for the next visit).
 */
export async function extraCast(t: Title): Promise<CastMember[]> {
  if (t.type !== "tv") return [];
  const all = [...t.people, ...(t.extras ?? [])];
  const have = new Set(all.map((c) => c.id));
  try {
    const slow = new Promise<CastMember[]>((res) => setTimeout(() => res([]), 3000));
    const got = await Promise.race([cached(t.id, t.imdbId, all.map((c) => c.name).sort().join("\n")), slow]);
    return got.filter((c) => !have.has(c.id));
  } catch { return []; }
}
