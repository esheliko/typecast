import { NextResponse, type NextRequest } from "next/server";
import { forYou } from "@/lib/foryou";
import { getLibrary } from "@/lib/library";
import { browse, TmdbError } from "@/lib/tmdb";
import type { BrowseList } from "@/lib/types";

const LISTS: BrowseList[] = ["foryou", "trending", "popular", "top", "new", "soon"];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const list = (LISTS.includes(p.get("list") as BrowseList) ? p.get("list") : "trending") as BrowseList;
  const type = p.get("type") === "tv" ? "tv" : p.get("type") === "movie" ? "movie" : "all";
  const page = Math.max(1, Math.min(200, +(p.get("page") ?? 1) || 1));
  try { return NextResponse.json(list === "foryou" ? await forYou(type, page, await getLibrary(), Number(p.get("salt")) || 1) : await browse(list, type, page)); }
  catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
