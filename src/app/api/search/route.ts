import { NextResponse, type NextRequest } from "next/server";
import { search, TmdbError } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  try { return NextResponse.json({ hits: await search(q) }); }
  catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
