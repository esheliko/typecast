import { NextResponse, type NextRequest } from "next/server";
import { parseBrowse } from "@/lib/browse";
import { getProfile } from "@/lib/library";
import { discover } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const profile = await getProfile();
    return NextResponse.json(await discover(parseBrowse(sp), Number(sp.get("page")) || 1, profile.country, profile.services), { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } });
  } catch (e) { const r = apiError(e, "api/discover"); return NextResponse.json(r.body, { status: r.status }); }
}
