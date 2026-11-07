import { NextResponse, type NextRequest } from "next/server";
import { search, TmdbError } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const k = req.nextUrl.searchParams.get("kind");
  const kind = k === "person" || k === "title" ? k : "all";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  try { return NextResponse.json({ hits: await search(q, kind) }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } }); }
  catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
