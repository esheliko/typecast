import { NextResponse, type NextRequest } from "next/server";
import { getSeasonCast } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";

/** One season's cast (a series' main cast changes from season to season). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), s = +(p.get("s") ?? 0);
  if (!tv || !(s >= 1)) return NextResponse.json({ error: "Missing show or season" }, { status: 400 });
  try { return NextResponse.json(await getSeasonCast(tv, s)); }
  catch (err) { const { body, status } = apiError(err, "api/season-cast"); return NextResponse.json(body, { status }); }
}
