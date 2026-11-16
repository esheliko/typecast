import { NextResponse, type NextRequest } from "next/server";
import { linkPeople, linkTitles, regulars, suggestSecond, suggestTitles } from "@/lib/connect";
import { getLibrary } from "@/lib/library";
import type { MediaType } from "@/lib/types";
import { apiError } from "@/lib/errors";

/**
 * ?people=1,2        titles both people were in (or co-stars linking them)
 * ?titles=movie:1,tv:2  actors in both titles
 * ?titlesFirst=1     titles of yours to start a titles connection from
 * ?next=person:1 | movie:2   suggestions for the second pick
 * ?regulars=1        actors who keep turning up in your library
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const people = (p.get("people") ?? "").split(",").filter((x) => /^\d+$/.test(x)).map(Number);
    if (people.length === 2) return NextResponse.json(await linkPeople(people[0], people[1]), { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } });
    const titles = (p.get("titles") ?? "").split(",").map((k) => k.match(/^(movie|tv):(\d+)$/)).filter(Boolean) as RegExpMatchArray[];
    if (titles.length === 2) return NextResponse.json(await linkTitles({ type: titles[0][1] as MediaType, id: +titles[0][2] }, { type: titles[1][1] as MediaType, id: +titles[1][2] }), { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } });
    if (p.get("titlesFirst")) return NextResponse.json({ titles: await suggestTitles(await getLibrary()) });
    const next = (p.get("next") ?? "").match(/^(person|movie|tv):(\d+)$/);
    if (next) {
      const lib = await getLibrary();
      return NextResponse.json(next[1] === "person" ? await suggestSecond("people", { id: +next[2] }, lib) : await suggestSecond("titles", { type: next[1] as MediaType, id: +next[2] }, lib));
    }
    if (p.get("regulars")) return NextResponse.json({ regulars: await regulars(await getLibrary()) });
    return NextResponse.json({ error: "Pick two people or two titles" }, { status: 400 });
  } catch (e) { const r = apiError(e, "api/connect"); return NextResponse.json(r.body, { status: r.status }); }
}
