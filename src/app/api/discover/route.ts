import { NextResponse, type NextRequest } from "next/server";
import { parseBrowse } from "@/lib/browse";
import { getProfile } from "@/lib/library";
import { discover, TmdbError } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const profile = await getProfile();
    return NextResponse.json(await discover(parseBrowse(sp), Number(sp.get("page")) || 1, profile.country, profile.services), { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } });
  } catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
