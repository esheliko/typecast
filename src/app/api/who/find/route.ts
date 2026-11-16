import type { NextRequest } from "next/server";
import { bad, failWho, okWho } from "@/lib/who-api";
import { getCast, search, tmdb } from "@/lib/tmdb";
import { loadWhoPerson, pool } from "@/lib/who-data";
import { lineForMany } from "@/lib/spoiler-line-data";
import { lineContextFrom } from "@/lib/spoiler-line";
import { holdBackCredits } from "@/lib/spoiler-mask";
import { matchCast, matchCredits, nameWindows, splitActorQuery, splitTitleQuery } from "@/lib/who-actor";

/**
 * GET ?q=: "Who's that?" with no title chosen; typos are fine. In this order:
 *  1. An actor's full name anywhere in the text ("george clooney as criminal", "wizard daniel radcliff").
 *  2. A title first, then a character ("hunger games haymitch"): that title's cast where the rest matches.
 *  3. One word of an actor's name, misspelt or cut short ("radclif wizard"); the most popular match.
 * For an actor: their credits where the rest matches the character, the title, or what the title is about (TMDB keywords). Series that are Watching keep their
 * spoiler line (no episode counts), as on /api/who/person.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return bad("Type a name");
  try {
    const sets = await Promise.all(nameWindows(q).map((t) => tmdb("/search/person", { query: t, include_adult: "false" }, 60 * 60).then((d) => (d.results ?? []) as { id: number; name: string; profile_path: string | null; popularity?: number }[]).catch(() => [])));
    const seen = new Set<number>();
    const people = sets.flat().filter((p) => !seen.has(p.id) && seen.add(p.id));

    let found = splitActorQuery(q, people);
    if (!found) {
      const w = q.split(/\s+/);
      const hits = (await Promise.all([...new Set([w.slice(0, 3).join(" "), w.slice(0, 2).join(" "), w[0]])].map((t) => search(t, "title").catch(() => [])))).flat()
        .flatMap((h) => (h.kind === "title" ? [h] : []));
      const t = splitTitleQuery(q, hits);
      if (t) {
        const cast = matchCast(await getCast(t.title.type, t.title.id, 200), t.rest);
        if (cast.length) return okWho({ person: null, title: { key: t.title.key, type: t.title.type, title: t.title.title, year: t.title.year, poster: t.title.poster }, people: cast, matches: [] }, 600);
      }
      found = splitActorQuery(q, people, { partial: true });
    }
    if (!found) return okWho({ person: null, matches: [] }, 60);

    const p = await loadWhoPerson(found.person.id);
    // "as criminal / lawyer": TMDB has no role text, so also look at what each of their best-known titles is about (its keywords).
    const themes: Record<string, string[]> = {};
    if (found.rest.length) {
      const top = p.credits.filter((c) => !c.extra).sort((a, b) => b.votes - a.votes).slice(0, 40);
      await pool(top, 6, async (c) => {
        const d = await tmdb(`/${c.type}/${c.id}/keywords`, {}, 24 * 60 * 60).catch(() => null);
        themes[c.key] = ((c.type === "tv" ? d?.results : d?.keywords) ?? []).map((k: { name: string }) => k.name);
      });
    }
    const ms = matchCredits(p.credits, found.rest, themes);
    const keys = ms.filter((m) => m.credit.type === "tv").map((m) => m.credit.key);
    const lines = await lineForMany(keys, lineContextFrom((n) => req.nextUrl.searchParams.get(n)));
    const held = holdBackCredits(ms.map((m) => m.credit), lines);
    return okWho({ person: { id: p.id, name: p.name, photo: p.photo }, matches: ms.map((m, i) => ({ credit: held[i], role: m.role, by: m.by })) }, 0);
  } catch (e) { return failWho(e); }
}
