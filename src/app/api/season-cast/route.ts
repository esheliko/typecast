import { NextResponse, type NextRequest } from "next/server";
import { getSeasonCast } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";
import { lineFor } from "@/lib/spoiler-line-data";
import { lineContextFrom } from "@/lib/spoiler-line";
import { holdBackCast } from "@/lib/spoiler-mask";

/** One season's cast (a series' main cast changes from season to season). A series that is Watching keeps its spoiler line: no per-person episode counts. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), s = +(p.get("s") ?? 0);
  if (!tv || !(s >= 1)) return NextResponse.json({ error: "Missing show or season" }, { status: 400 });
  try {
    const line = await lineFor(`tv:${tv}`, lineContextFrom((n) => p.get(n)));
    return NextResponse.json(holdBackCast(await getSeasonCast(tv, s), line), { headers: { "Cache-Control": "private, max-age=0" } });
  }
  catch (err) { const { body, status } = apiError(err, "api/season-cast"); return NextResponse.json(body, { status }); }
}
