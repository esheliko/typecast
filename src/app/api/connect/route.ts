import { NextResponse, type NextRequest } from "next/server";
import { linkPeople, linkTitles, regulars } from "@/lib/connect";
import { getLibrary } from "@/lib/library";
import { TmdbError } from "@/lib/tmdb";
import type { MediaType } from "@/lib/types";

/**
 * ?people=1,2        titles both people were in (or co-stars linking them)
 * ?titles=movie:1,tv:2  actors in both titles
 * ?regulars=1        actors who keep turning up in your library
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const people = (p.get("people") ?? "").split(",").filter((x) => /^\d+$/.test(x)).map(Number);
    if (people.length === 2) return NextResponse.json(await linkPeople(people[0], people[1]));
    const titles = (p.get("titles") ?? "").split(",").map((k) => k.match(/^(movie|tv):(\d+)$/)).filter(Boolean) as RegExpMatchArray[];
    if (titles.length === 2) return NextResponse.json(await linkTitles({ type: titles[0][1] as MediaType, id: +titles[0][2] }, { type: titles[1][1] as MediaType, id: +titles[1][2] }));
    if (p.get("regulars")) return NextResponse.json({ regulars: await regulars(await getLibrary()) });
    return NextResponse.json({ error: "Pick two people or two titles" }, { status: 400 });
  } catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
