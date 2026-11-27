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
    // The library and the episode are asked for while the spoiler line is worked out (server side only: nothing is sent unless the line allows it).
    const libP = getLibrary(), epP = getEpisode(tv, s, e);
    libP.catch(() => {}); epP.catch(() => {});
    const line = await lineFor(`tv:${tv}`, lineContextFrom((k) => p.get(k)));
    if (!allowsEpisode(line, s, e)) return NextResponse.json({ name: "", guests: [], cast: [], libKeys: {}, hidden: hiddenOf(line) }, { headers: { "Cache-Control": "private, max-age=0" } });
    const [ep, lib] = await Promise.all([epP, libP]);
    const cur = `tv:${tv}`;
    // Guests and cast are looked up as ONE list (a person in both is fetched once), guests first, a few at a time so TMDB does not answer 429, and within a time budget.
    const merged = [...ep.guests.slice(0, 20), ...ep.cast.slice(0, 20)].filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
    const rich = new Map((await enrich(merged, lib, cur, { limit: 40, workers: 8, budgetMs: 2000 })).map((m) => [m.id, m]));
    // Each list keeps its own entry (a person's guest part and cast part can differ) and takes only the looked-up extras.
    const withExtras = (c: (typeof ep.guests)[number]) => { const r = rich.get(c.id); return { ...c, hits: r?.hits ?? [], also: r?.also ?? [], top: r?.top ?? [] }; };
    const guests = ep.guests.map(withExtras), cast = ep.cast.map(withExtras);
    const libKeys = Object.fromEntries(lib.map((l) => [l.key, l.status]));
    return NextResponse.json({ name: ep.name, guests, cast, libKeys });
  } catch (err) { const r = apiError(err, "api/episode"); return NextResponse.json(r.body, { status: r.status }); }
}
