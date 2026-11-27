import { NextResponse, type NextRequest } from "next/server";
import { forYou } from "@/lib/foryou";
import { currentUid, getLibrary, getProfile } from "@/lib/library";
import { browse } from "@/lib/tmdb";
import { upcomingPage } from "@/lib/upcoming-picks";
import type { BrowseList } from "@/lib/types";
import { apiError } from "@/lib/errors";

const LISTS: BrowseList[] = ["foryou", "upcoming", "trending", "popular", "top", "new", "soon"];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const list = (LISTS.includes(p.get("list") as BrowseList) ? p.get("list") : "trending") as BrowseList;
  const type = p.get("type") === "tv" ? "tv" : p.get("type") === "movie" ? "movie" : "all";
  const page = Math.max(1, Math.min(200, +(p.get("page") ?? 1) || 1));
  try {
    if (list === "foryou") {
      // The salt is in the URL, so one visit's pages are one cacheable question; the ranking itself is kept server side for a few minutes (src/lib/foryou.ts).
      const [lib, region, uid] = await Promise.all([getLibrary(), getProfile().catch(() => undefined), currentUid().catch(() => null)]);
      return NextResponse.json(await forYou(type, page, lib, Number(p.get("salt")) || 1, region, uid ?? undefined), { headers: { "Cache-Control": "private, max-age=120" } });
    }
    if (list === "upcoming") {
      // Ranked on your taste and kept server side for a few minutes (src/lib/upcoming-picks.ts), so later pages only slice it.
      const [lib, region, uid] = await Promise.all([getLibrary(), getProfile().catch(() => undefined), currentUid().catch(() => null)]);
      return NextResponse.json(await upcomingPage(type, page, lib, region?.country ?? "", uid ?? undefined), { headers: { "Cache-Control": "private, max-age=120" } });
    }
    return NextResponse.json(await browse(list, type, page), { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } }); }
  catch (e) { const r = apiError(e, "api/browse"); return NextResponse.json(r.body, { status: r.status }); }
}
