import { NextResponse, type NextRequest } from "next/server";
import { getSeason, TmdbError } from "@/lib/tmdb";

/** One season's episodes: names, air dates, guests, director and writers. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), s = +(p.get("s") ?? -1);
  if (!tv || !(s >= 0)) return NextResponse.json({ error: "Missing show or season" }, { status: 400 });
  try { return NextResponse.json(await getSeason(tv, s)); }
  catch (err) { const st = err instanceof TmdbError ? err.status : 500; return NextResponse.json({ error: (err as Error).message }, { status: st }); }
}
