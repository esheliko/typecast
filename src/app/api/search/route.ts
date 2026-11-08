import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const k = req.nextUrl.searchParams.get("kind");
  const kind = k === "person" || k === "title" ? k : "all";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  try { return NextResponse.json({ hits: await search(q, kind) }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } }); }
  catch (e) { const r = apiError(e, "api/search"); return NextResponse.json(r.body, { status: r.status }); }
}
