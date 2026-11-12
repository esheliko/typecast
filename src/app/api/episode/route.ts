import { NextResponse, type NextRequest } from "next/server";
import { getEpisode } from "@/lib/tmdb";
import { enrich } from "@/lib/enrich";
import { getLibrary } from "@/lib/library";
import { apiError } from "@/lib/errors";
import { lineFor } from "@/lib/spoiler-line-data";
import { allowsEpisode, hiddenOf, lineContextFrom } from "@/lib/spoiler-line";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), s = +(p.get("s") ?? 0), e = +(p.get("e") ?? 0);
  if (!tv || !s || !e) return NextResponse.json({ error: "Missing show, season or episode" }, { status: 400 });
  try {
    // An episode after the saved place of a series that is Watching in the library is held back (docs/features/spoilers.md); `reveal=1` lifts it for that view.
    const line = await lineFor(`tv:${tv}`, lineContextFrom((k) => p.get(k)));
    if (!allowsEpisode(line, s, e)) return NextResponse.json({ name: "", guests: [], cast: [], libKeys: {}, hidden: hiddenOf(line) }, { headers: { "Cache-Control": "private, max-age=0" } });
    const [ep, lib] = await Promise.all([getEpisode(tv, s, e), getLibrary()]);
    const cur = `tv:${tv}`;
    const [guests, cast] = await Promise.all([enrich(ep.guests, lib, cur), enrich(ep.cast, lib, cur)]);
    const libKeys = Object.fromEntries(lib.map((l) => [l.key, l.status]));
    return NextResponse.json({ name: ep.name, guests, cast, libKeys });
  } catch (err) { const r = apiError(err, "api/episode"); return NextResponse.json(r.body, { status: r.status }); }
}
