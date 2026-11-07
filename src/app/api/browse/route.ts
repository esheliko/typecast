import { NextResponse, type NextRequest } from "next/server";
import { browse, TmdbError } from "@/lib/tmdb";
import type { BrowseList } from "@/lib/types";

const LISTS: BrowseList[] = ["trending", "popular", "top", "new", "soon"];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const list = (LISTS.includes(p.get("list") as BrowseList) ? p.get("list") : "trending") as BrowseList;
  const type = p.get("type") === "tv" ? "tv" : "movie";
  const page = Math.max(1, Math.min(30, +(p.get("page") ?? 1) || 1));
  try { return NextResponse.json(await browse(list, type, page)); }
  catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
