import { NextResponse, type NextRequest } from "next/server";
import { getSeason } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";
import { lineFor } from "@/lib/spoiler-line-data";
import { holdBackSeason, lineContextFrom } from "@/lib/spoiler-line";

/**
 * One season's episodes: names, air dates, guests, director and writers. A series that is Watching in the library keeps its spoiler line
 * (docs/features/spoilers.md): episodes after the saved place keep their number and air date only (`hidden: true`), and `hidden` says which line;
 * `reveal=1` lifts it for that view only. Depends on the library, so the browser does not cache it.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), s = +(p.get("s") ?? -1);
  if (!tv || !(s >= 0)) return NextResponse.json({ error: "Missing show or season" }, { status: 400 });
  try {
    const [season, line] = await Promise.all([getSeason(tv, s), lineFor(`tv:${tv}`, lineContextFrom((k) => p.get(k)))]);
    return NextResponse.json(holdBackSeason(season, line), { headers: { "Cache-Control": "private, max-age=0" } });
  }
  catch (err) { const { body, status } = apiError(err, "api/season"); return NextResponse.json(body, { status }); }
}
