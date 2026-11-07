import { NextResponse, type NextRequest } from "next/server";
import { getEpisode, TmdbError } from "@/lib/tmdb";
import { enrich } from "@/lib/enrich";
import { getLibrary } from "@/lib/library";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), s = +(p.get("s") ?? 0), e = +(p.get("e") ?? 0);
  if (!tv || !s || !e) return NextResponse.json({ error: "Missing show, season or episode" }, { status: 400 });
  try {
    const [ep, lib] = await Promise.all([getEpisode(tv, s, e), getLibrary()]);
    const cur = `tv:${tv}`;
    const [guests, cast] = await Promise.all([enrich(ep.guests, lib, cur), enrich(ep.cast, lib, cur)]);
    const libKeys = Object.fromEntries(lib.map((l) => [l.key, l.status]));
    return NextResponse.json({ name: ep.name, guests, cast, libKeys });
  } catch (err) { const st = err instanceof TmdbError ? err.status : 500; return NextResponse.json({ error: (err as Error).message }, { status: st }); }
}
