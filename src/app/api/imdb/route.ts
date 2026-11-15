import { NextResponse, type NextRequest } from "next/server";
import { getTitleImdbId } from "@/lib/tmdb";
import { getImdbRating, getSeasonImdb } from "@/lib/imdb-rating";

export const maxDuration = 30;
const HEADERS = { "Cache-Control": "private, max-age=3600" };

/** IMDb scores for the rating text on screen. `k=movie:1,tv:2` gives { "movie:1": 7.8 } (unknown keys are left out); `tv=ID&s=N` gives { eps: { 1: 8.1 } }. Fails soft: unknown means empty. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = Number(p.get("tv")), s = Number(p.get("s"));
  if (Number.isInteger(tv) && tv > 0 && Number.isInteger(s) && s >= 0) {
    const imdb = await getTitleImdbId("tv", tv);
    return NextResponse.json({ eps: await getSeasonImdb(imdb, s) }, { headers: HEADERS });
  }
  const keys = [...new Set((p.get("k") ?? "").split(",").filter((k) => /^(movie|tv):\d{1,9}$/.test(k)))].slice(0, 40);
  const out: Record<string, number> = {};
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async (k) => {
      const [type, id] = k.split(":");
      const r = await getImdbRating(await getTitleImdbId(type as "movie" | "tv", Number(id)));
      if (r) out[k] = r.rating;
    }));
  }
  return NextResponse.json(out, { headers: HEADERS });
}
