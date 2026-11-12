import { NextResponse, type NextRequest } from "next/server";
import { getAppearances } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";
import { lineFor } from "@/lib/spoiler-line-data";
import { holdBackAppearances, lineContextFrom } from "@/lib/spoiler-line";

/**
 * Which episodes of a series one person was in. `c` is their TMDB credit ids (comma-separated), `n` their episode count.
 * A series that is Watching in the library keeps its spoiler line (docs/features/spoilers.md): later episodes are left out and `hidden` says so;
 * `reveal=1` lifts it for that view only, `pg`/`ps` name the /watching page's own title. Depends on the library, so the browser does not cache it.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), n = Math.max(0, +(p.get("n") ?? 0) || 0);
  const ids = (p.get("c") ?? "").split(",").filter((id) => /^[0-9a-f]{20,32}$/.test(id));
  if (!tv || !ids.length) return NextResponse.json({ error: "Missing show or credits" }, { status: 400 });
  try {
    const [a, line] = await Promise.all([getAppearances(tv, ids, n), lineFor(`tv:${tv}`, lineContextFrom((k) => p.get(k)))]);
    return NextResponse.json(holdBackAppearances(a, line), { headers: { "Cache-Control": "private, max-age=0" } });
  }
  catch (err) { const { body, status } = apiError(err, "api/appearances"); return NextResponse.json(body, { status }); }
}
