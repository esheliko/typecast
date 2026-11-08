import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";
import { layoutSearch, norm } from "@/lib/search-intent";
import { suggestSpelling } from "@/lib/spell";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const k = req.nextUrl.searchParams.get("kind");
  const kind = k === "person" || k === "title" ? k : "all";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const headers = { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" };
  try {
    const hits = await search(q, kind);
    // Only when nothing matches well: ask for a spelling fix, and use it only if it gives a clear answer. `exact=1` is "search for what I typed".
    if (kind === "all" && q.length >= 3 && req.nextUrl.searchParams.get("exact") !== "1" && layoutSearch(q, hits).intent === "unclear") {
      const fix = await suggestSpelling(q);
      if (fix && norm(fix) !== norm(q)) {
        const alt = await search(fix).catch(() => []);
        if (alt.length && layoutSearch(fix, alt).intent !== "unclear") return NextResponse.json({ hits: alt, didYouMean: fix }, { headers });
      }
    }
    return NextResponse.json({ hits }, { headers });
  } catch (e) { const r = apiError(e, "api/search"); return NextResponse.json(r.body, { status: r.status }); }
}
