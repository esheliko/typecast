import { NextResponse, type NextRequest } from "next/server";
import { getCast, tmdb } from "@/lib/tmdb";
import { pool } from "@/lib/who-data";
import { restWords } from "@/lib/who-actor";
import { pairInCast, type PairInCast } from "@/lib/character-pair";
import { apiError } from "@/lib/errors";
import type { MediaType } from "@/lib/types";

const DAY = 24 * 3600;
type Row = { id: number; name?: string; title?: string; first_air_date?: string; release_date?: string; poster_path?: string | null };
type Show = { key: string; type: MediaType; id: number; title: string; year: string; poster: string | null };

/**
 * ?a=sheldon&b=penny: two characters with no show named. Looks through the casts of the most-voted series and films, in batches,
 * and answers from the first batch where both characters are in the same cast (best billed first). Empty list when none is.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const a = restWords((q.get("a") ?? "").slice(0, 60)), b = restWords((q.get("b") ?? "").slice(0, 60));
  if (!a.length || !b.length) return NextResponse.json({ matches: [] });
  try {
    const pages = await Promise.all([
      ...[1, 2, 3, 4].map((page) => tmdb("/discover/tv", { sort_by: "vote_count.desc", page: String(page) }, DAY).catch(() => null).then((d) => ((d?.results ?? []) as Row[]).map((r): Show => ({ key: `tv:${r.id}`, type: "tv", id: r.id, title: r.name ?? "", year: (r.first_air_date ?? "").slice(0, 4), poster: r.poster_path ?? null })))),
      ...[1, 2, 3].map((page) => tmdb("/discover/movie", { sort_by: "vote_count.desc", page: String(page) }, DAY).catch(() => null).then((d) => ((d?.results ?? []) as Row[]).map((r): Show => ({ key: `movie:${r.id}`, type: "movie", id: r.id, title: r.title ?? "", year: (r.release_date ?? "").slice(0, 4), poster: r.poster_path ?? null })))),
    ]);
    // Series first (characters like Sheldon and Penny live there), then films, each in vote order.
    const shows = [...pages.slice(0, 4).flat(), ...pages.slice(4).flat()];
    const found: { show: Show; hit: PairInCast }[] = [];
    for (let i = 0; i < shows.length && !found.length; i += 24) {
      const got = await pool(shows.slice(i, i + 24), 8, async (s) => { const hit = pairInCast(await getCast(s.type, s.id, 2000).catch(() => []), a, b); return hit ? { show: s, hit } : null; });
      for (const g of got) if (g) found.push(g);
    }
    found.sort((x, y) => x.hit.rank - y.hit.rank);
    // Deep in the billing it is a bit part that only sounds alike (Sheldon Leavitt, Lenny), not the pair meant.
    const matches = found.filter((f) => f.hit.rank <= 20).slice(0, 3).map(({ show, hit }) => ({ show, a: hit.a, b: hit.b }));
    return NextResponse.json({ matches }, { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } });
  } catch (e) { const r = apiError(e, "api/connect/characters"); return NextResponse.json(r.body, { status: r.status }); }
}
