import { NextResponse, type NextRequest } from "next/server";
import { getFranchise, getSimilar, TmdbError } from "@/lib/tmdb";

/** ?type=movie&id=1726  the rest of this title's collection / universe, in release order. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const type = p.get("type"), id = p.get("id") ?? "";
  if ((type !== "movie" && type !== "tv") || !/^\d+$/.test(id)) return NextResponse.json({ error: "Bad title" }, { status: 400 });
  try { return NextResponse.json({ groups: await (p.get("similar") ? getSimilar(type, +id) : getFranchise(type, +id)) }, { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } }); }
  catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
