import type { NextRequest } from "next/server";
import { bad, failWho, okWho } from "@/lib/who-api";
import { getCast, getSeason, tmdb } from "@/lib/tmdb";
import { suggestSpelling } from "@/lib/spell";
import { loadWhoPerson, pool } from "@/lib/who-data";
import { lineForMany } from "@/lib/spoiler-line-data";
import { isHidden, lineContextFrom } from "@/lib/spoiler-line";
import { holdBackCredits } from "@/lib/spoiler-mask";
import { findRelation, matchCast, matchCredits, matchEpisodes, nameWindows, relatives, splitActorQuery, splitTitleQuery } from "@/lib/who-actor";
import type { MediaType } from "@/lib/types";

type Multi = { id: number; media_type: string; name?: string; title?: string; profile_path: string | null; poster_path: string | null; first_air_date?: string; release_date?: string; popularity?: number };
const DAY = 24 * 60 * 60;

/**
 * GET ?q=: "Who's that?" with no title chosen; typos are fine (when TMDB finds nothing at all, Wikipedia's spelling of the whole text is tried once). In this order:
 *  1. An actor's full name anywhere in the text ("george clooney as criminal", "wizard daniel radcliff").
 *  2. A title anywhere (even cut short, or its initials), then what is left ("hunger games haymitch", "kev shameless", "himym ...", "big bang sheldon mom"): that
 *     title's cast by character or name, or a relative of a character ("sheldon mom"), or an episode by its name.
 *  3. One word of an actor's name, misspelt or cut short ("radclif wizard"); the most popular match.
 * For an actor: their credits where the rest matches the character, the title, or what the title is about (TMDB keywords). Series that are Watching keep their
 * spoiler line (no episode counts, no episode names), as on /api/who/person.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return bad("Type a name");
  try {
    const param = (n: string) => req.nextUrl.searchParams.get(n);
    let r = await solve(q, param);
    if (!r) {
      const fix = await suggestSpelling(q);
      if (fix && fix.toLowerCase() !== q.toLowerCase()) r = await solve(fix.slice(0, 120), param);
    }
    return okWho(r ?? { person: null, matches: [] }, r ? 0 : 60);
  } catch (e) { return failWho(e); }
}

async function solve(q: string, param: (n: string) => string | null): Promise<Record<string, unknown> | null> {
  const sets = await Promise.all(nameWindows(q).map((t) => tmdb("/search/multi", { query: t, include_adult: "false" }, 60 * 60).then((d) => (d.results ?? []) as Multi[]).catch(() => [] as Multi[])));
  const seenP = new Set<number>(), seenT = new Set<string>();
  const people: { id: number; name: string; popularity?: number }[] = [], titles: { key: string; type: MediaType; id: number; title: string; year: string; poster: string | null; popularity?: number }[] = [];
  for (const m of sets.flat()) {
    if (m.media_type === "person" && m.name && !seenP.has(m.id)) { seenP.add(m.id); people.push({ id: m.id, name: m.name, popularity: m.popularity }); }
    else if ((m.media_type === "tv" || m.media_type === "movie") && !seenT.has(`${m.media_type}:${m.id}`)) {
      seenT.add(`${m.media_type}:${m.id}`);
      titles.push({ key: `${m.media_type}:${m.id}`, type: m.media_type, id: m.id, title: (m.name ?? m.title ?? ""), year: (m.first_air_date ?? m.release_date ?? "").slice(0, 4), poster: m.poster_path, popularity: m.popularity });
    }
  }

  let found = splitActorQuery(q, people);
  let titleOnly: Record<string, unknown> | null = null; // a title was named but nothing in it fits: shown if no actor fits either
  if (!found) {
    const t = splitTitleQuery(q, titles);
    if (t) {
      const head = { key: t.title.key, type: t.title.type, title: t.title.title, year: t.title.year, poster: t.title.poster };
      const cast = await getCast(t.title.type, t.title.id, 2000).catch(() => []);
      const rel = findRelation(t.rest);
      if (rel) {
        // Birth years of the possible relatives, to tell a mother from a sister.
        const sur = new Map<number, number | null>();
        const first = relatives(cast, rel.anchor, rel.rel, () => null);
        if (first) {
          await pool([first.of, ...first.people].slice(0, 8), 4, async (c) => { sur.set(c.id, await loadWhoPerson(c.id).then((p) => (p.birthday ? Number(p.birthday.slice(0, 4)) : null)).catch(() => null)); });
          const rs = relatives(cast, rel.anchor, rel.rel, (id) => sur.get(id) ?? null);
          if (rs) {
            const of = rs.of.role.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
            return { person: null, title: head, people: rs.people.slice(0, 8).map((c) => ({ id: c.id, name: c.name, photo: c.photo, role: c.role, why: `${of}'s ${rel.word}` })), matches: [] };
          }
        }
      }
      if (t.rest.length) titleOnly = { person: null, title: head, people: [], matches: [] };
      const hit = matchCast(cast, t.rest);
      if (hit.length) return { person: null, title: head, people: hit, matches: [] };
      if (t.title.type === "tv" && t.rest.length) {
        // No character fits: maybe it describes an episode ("asian restaurant" -> The Chinese Restaurant). Never for a series that is Watching with a spoiler line.
        if (!(await heldBack(t.title.key, param))) {
          const n = (await tmdb(`/tv/${t.title.id}`, {}, DAY).catch(() => null))?.number_of_seasons ?? 0;
          const seasons = await pool(Array.from({ length: Math.min(n, 15) }, (_, i) => i + 1), 4, (s) => getSeason(t.title.id, s).catch(() => null));
          const eps = seasons.flatMap((sn, i) => (sn?.episodes ?? []).map((e) => ({ s: i + 1, e: e.e, name: e.name })));
          const hitEps = matchEpisodes(eps, t.rest);
          if (hitEps.length) return { person: null, title: head, people: [], episodes: hitEps, matches: [] };
        }
      }
    }
    found = splitActorQuery(q, people, { partial: true });
  }
  if (!found) return titleOnly;

  const p = await loadWhoPerson(found.person.id);
  // "as criminal / lawyer": TMDB has no role text, so also look at what each of their best-known titles is about (its keywords).
  const themes: Record<string, string[]> = {};
  if (found.rest.length) {
    const top = p.credits.filter((c) => !c.extra).sort((a, b) => b.votes - a.votes).slice(0, 40);
    await pool(top, 6, async (c) => {
      const d = await tmdb(`/${c.type}/${c.id}/keywords`, {}, DAY).catch(() => null);
      themes[c.key] = ((c.type === "tv" ? d?.results : d?.keywords) ?? []).map((k: { name: string }) => k.name);
    });
  }
  const ms = matchCredits(p.credits, found.rest, themes);
  const keys = ms.filter((m) => m.credit.type === "tv").map((m) => m.credit.key);
  const lines = await lineForMany(keys, lineContextFrom(param));
  const held = holdBackCredits(ms.map((m) => m.credit), lines);
  return { person: { id: p.id, name: p.name, photo: p.photo }, matches: ms.map((m, i) => ({ credit: held[i], role: m.role, by: m.by })) };
}

/** Is this series held back by a spoiler line for this request (so its episode names must not be listed)? */
async function heldBack(key: string, param: (n: string) => string | null): Promise<boolean> {
  const l = (await lineForMany([key], lineContextFrom(param)))[key];
  return !!l && isHidden(l);
}
