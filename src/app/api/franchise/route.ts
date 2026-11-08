import { NextResponse, type NextRequest } from "next/server";
import { getFranchise, getSimilar } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";

/** ?type=movie&id=1726  the rest of this title's collection / universe, in release order. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const type = p.get("type"), id = p.get("id") ?? "";
  if ((type !== "movie" && type !== "tv") || !/^\d+$/.test(id)) return NextResponse.json({ error: "Bad title" }, { status: 400 });
  try { return NextResponse.json({ groups: await (p.get("similar") ? getSimilar(type, +id) : getFranchise(type, +id)) }, { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } }); }
  catch (e) { const r = apiError(e, "api/franchise"); return NextResponse.json(r.body, { status: r.status }); }
}
