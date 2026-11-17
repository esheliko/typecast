import { NextResponse, type NextRequest } from "next/server";
import { getCast, tmdb } from "@/lib/tmdb";
import { pool } from "@/lib/who-data";
import { restWords } from "@/lib/who-actor";
import { coverCast, pairInCast, type CastLite } from "@/lib/character-pair";
import { apiError } from "@/lib/errors";
import type { MediaType } from "@/lib/types";

const DAY = 24 * 3600;
type Row = { id: number; name?: string; title?: string; first_air_date?: string; release_date?: string; poster_path?: string | null };
type Show = { key: string; type: MediaType; id: number; title: string; year: string; poster: string | null };

/**
 * ?a=sheldon&b=penny: two characters with no show named. ?q=nolan harper lucy tim: one or more characters, no separator ("sheldon cooper", "ted mosby").
 * Looks through the casts of the most-voted series and films, in batches, and answers from the first batch where all of them are in the same cast
 * (best billed first). Empty list when none is.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const a = restWords((q.get("a") ?? "").slice(0, 60)), b = restWords((q.get("b") ?? "").slice(0, 60));
  const all = restWords((q.get("q") ?? "").slice(0, 80)).slice(0, 8);
  const match = (cast: CastLite[]): { members: CastLite[]; rank: number } | null => {
    if (a.length && b.length) { const h = pairInCast(cast, a, b); return h && { members: [h.a, h.b], rank: h.rank }; }
    return all.length ? coverCast(cast, all) : null;
  };
  if (!(a.length && b.length) && !all.length) return NextResponse.json({ matches: [] });
  try {
    // Most-voted series first (Sheldon and Penny live there), then what is popular right now (a current show like The Rookie), then more by votes, then films.
    const rows = (path: string, sort: string, page: number, type: MediaType) => tmdb(path, { sort_by: sort, page: String(page) }, DAY).catch(() => null)
      .then((d) => ((d?.results ?? []) as Row[]).map((r): Show => type === "tv"
        ? { key: `tv:${r.id}`, type, id: r.id, title: r.name ?? "", year: (r.first_air_date ?? "").slice(0, 4), poster: r.poster_path ?? null }
        : { key: `movie:${r.id}`, type, id: r.id, title: r.title ?? "", year: (r.release_date ?? "").slice(0, 4), poster: r.poster_path ?? null }));
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const pages = await Promise.all([
      ...range(1, 4).map((p) => rows("/discover/tv", "vote_count.desc", p, "tv")),
      ...range(1, 4).map((p) => rows("/discover/tv", "popularity.desc", p, "tv")),
      ...range(5, 10).map((p) => rows("/discover/tv", "vote_count.desc", p, "tv")),
      ...range(1, 3).map((p) => rows("/discover/movie", "vote_count.desc", p, "movie")),
      ...range(1, 2).map((p) => rows("/discover/movie", "popularity.desc", p, "movie")),
    ]);
    const seen = new Set<string>();
    const shows = pages.flat().filter((x) => !seen.has(x.key) && !!seen.add(x.key));
    const found: { show: Show; hit: { members: CastLite[]; rank: number } }[] = [];
    for (let i = 0; i < shows.length && !found.length; i += 24) {
      const got = await pool(shows.slice(i, i + 24), 8, async (s) => { const hit = match(await getCast(s.type, s.id, 2000).catch(() => [])); // Deep in the billing it is a bit part that only sounds alike (Sheldon Leavitt, Teddy, Lenny), not what was meant; it must not end the search either.
      return hit && hit.rank <= 15 * hit.members.length ? { show: s, hit } : null; });
      for (const g of got) if (g) found.push(g);
    }
    found.sort((x, y) => x.hit.rank - y.hit.rank);
    const matches = found.slice(0, 3).map(({ show, hit }) => ({ show, members: hit.members }));
    return NextResponse.json({ matches }, { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } });
  } catch (e) { const r = apiError(e, "api/connect/characters"); return NextResponse.json(r.body, { status: r.status }); }
}
