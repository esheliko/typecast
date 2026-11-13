import { NextResponse, type NextRequest } from "next/server";
import { getSeason } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";
import { lineFor } from "@/lib/spoiler-line-data";
import { lineContextFrom } from "@/lib/spoiler-line";
import { episodeFaces } from "@/lib/episode-faces";

/**
 * The top 3 faces per episode of one season, for the episode list. Same cached TMDB season data as /api/season (no extra call), but only faces, names and a
 * count leave here, and episodes after the saved place of a Watching series come back as `hidden` with nothing about their cast (docs/features/series.md).
 * Fails soft on the page: an error just means no faces.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), s = +(p.get("s") ?? -1);
  if (!tv || !(s >= 0)) return NextResponse.json({ error: "Missing show or season" }, { status: 400 });
  try {
    const line = await lineFor(`tv:${tv}`, lineContextFrom((k) => p.get(k)));
    const headers = { "Cache-Control": "private, max-age=0" };
    // Series-only: every episode is held back, so TMDB is not even asked.
    if (line.kind === "series-only") return NextResponse.json({ episodes: [] }, { headers });
    const season = await getSeason(tv, s);
    return NextResponse.json({ episodes: episodeFaces(s, season.episodes, line) }, { headers });
  }
  catch (err) { const { body, status } = apiError(err, "api/season-faces"); return NextResponse.json(body, { status }); }
}
