import { NextResponse, type NextRequest } from "next/server";
import { forYou } from "@/lib/foryou";
import { getLibrary } from "@/lib/library";
import { browse } from "@/lib/tmdb";
import type { BrowseList } from "@/lib/types";
import { apiError } from "@/lib/errors";

const LISTS: BrowseList[] = ["foryou", "trending", "popular", "top", "new", "soon"];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const list = (LISTS.includes(p.get("list") as BrowseList) ? p.get("list") : "trending") as BrowseList;
  const type = p.get("type") === "tv" ? "tv" : p.get("type") === "movie" ? "movie" : "all";
  const page = Math.max(1, Math.min(200, +(p.get("page") ?? 1) || 1));
  try { return list === "foryou"
      ? NextResponse.json(await forYou(type, page, await getLibrary(), Number(p.get("salt")) || 1))
      : NextResponse.json(await browse(list, type, page), { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } }); }
  catch (e) { const r = apiError(e, "api/browse"); return NextResponse.json(r.body, { status: r.status }); }
}
