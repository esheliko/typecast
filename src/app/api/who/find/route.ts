import type { NextRequest } from "next/server";
import { bad, failWho, okWho } from "@/lib/who-api";
import { getCast, getSeason, getTitleImdbId, tmdb } from "@/lib/tmdb";
import { getArticle, getWikiFacts } from "@/lib/wiki";
import { suggestSpelling } from "@/lib/spell";
import { loadWhoPerson, pool } from "@/lib/who-data";
import { lineForMany } from "@/lib/spoiler-line-data";
import { isHidden, lineContextFrom } from "@/lib/spoiler-line";
import { holdBackCredits } from "@/lib/spoiler-mask";
import { findRelation, matchCast, parseCastBlurbs, restWords, roleHas, type Relation, mainCast, popularTitle, matchCredits, matchEpisodes, nameWindows, relatives, splitActorQuery, splitTitleQuery } from "@/lib/who-actor";
import type { MediaType } from "@/lib/types";

type Multi = { id: number; media_type: string; name?: string; title?: string; profile_path: string | null; poster_path: string | null; first_air_date?: string; release_date?: string; popularity?: number };
const DAY = 24 * 60 * 60;

/**
 * GET ?q=: "Who's that?" with no title chosen; typos are fine (when TMDB finds nothing at all, Wikipedia's spelling of the whole text is tried once). In this order:
 *  1. An actor's full name anywhere in the text ("george clooney as criminal", "wizard daniel radcliff").
 *  2. A title anywhere (alone, "harry potter", it gives that title's main cast) (even cut short, or its initials), then what is left ("hunger games haymitch", "kev shameless", "himym ...", "big bang sheldon mom"): that
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

const words1 = (name: string) => name.trim().split(/\s+/).length === 1;

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
  /** A title named anywhere in the text, then what is left: its cast, a relative of a character, or an episode. */
  const byTitle = async (): Promise<Record<string, unknown> | null> => {
    const t = splitTitleQuery(q, titles);
    if (!t) return null;
    if (!t.rest.length) t.title = popularTitle(q, titles) ?? t.title;
    const head = { key: t.title.key, type: t.title.type, title: t.title.title, year: t.title.year, poster: t.title.poster };
    const cast = await getCast(t.title.type, t.title.id, 2000).catch(() => []);
    const rel = findRelation(t.rest);
    if (rel) {
      const ans = await relationAnswer([t.title], rel.anchor, rel.rel, rel.word);
      if (ans) return { person: null, title: head, people: ans, matches: [] };
    }
    if (!t.rest.length) {
      // Just a title ("harry potter"): its main cast, the characters named in the text first (Harry Potter -> Daniel Radcliffe).
      const main = mainCast(cast, q);
      if (main.length) return { person: null, title: head, people: main, matches: [], plain: true };
    }
    if (t.rest.length) titleOnly = { person: null, title: head, people: [], matches: [] };
    const hit = matchCast(cast, t.rest, t.rest.length ? await castBlurbs(t.title.type, t.title.id, t.title.key, param) : undefined);
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
    return null;
  };
  // "himym lisa": a one-word actor name ("LISA") must not beat a named title that has that character.
  if (found && found.rest.length && words1(found.person.name)) { const a = await byTitle(); if (a) return a; titleOnly = null; }
  if (!found) {
    { const a = await byTitle(); if (a) return a; }
    // No title named, but "sheldon cooper mom": whose relative? Look for the character in the best matches, and in the other shows its actors appear as it.
    const rel = findRelation(restWords(q));
    if (rel) {
      const seeds = titles.filter((x) => (x.popularity ?? 0) >= 3).sort((a, b) => Number(rel.anchor.some((w) => b.title.toLowerCase().includes(w))) - Number(rel.anchor.some((w) => a.title.toLowerCase().includes(w))) || (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, 4);
      const ans = seeds.length ? await relationAnswer(seeds, rel.anchor, rel.rel, rel.word) : null;
      if (ans) return { person: null, title: null, people: ans, matches: [] };
    }
    found = splitActorQuery(q, people, { partial: true });
    // Still nothing and it is a relative ("ted sister"): the character may be in any well-known show, not only one the search named.
    if (!found && rel) { const ans = await famousRelation(rel.anchor, rel.rel, rel.word); if (ans) return { person: null, title: null, people: ans, matches: [] }; }
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
  return { person: { id: p.id, name: p.name, photo: p.photo }, plain: !found.rest.length, matches: ms.map((m, i) => ({ credit: held[i], role: m.role, by: m.by })) };
}

/** Is this series held back by a spoiler line for this request (so its episode names must not be listed)? */
async function heldBack(key: string, param: (n: string) => string | null): Promise<boolean> {
  const l = (await lineForMany([key], lineContextFrom(param)))[key];
  return !!l && isHidden(l);
}

type Show = { key: string; type: MediaType; id: number; title: string };
/**
 * Relatives of a character ("sheldon cooper mom") in the given shows, and in the other shows the actors of that character appear as it (Young Sheldon's
 * Sheldon is also in The Big Bang Theory, as is his voice-over in Young Sheldon), so a character with two casts gives both mothers. Null when no show has it.
 */
async function relationAnswer(seeds: Show[], anchor: string[], rel: Relation, word: string) {
  const out: { id: number; name: string; photo: string | null; role: string; why: string; show: string; tkey: string; ttype: MediaType }[] = [];
  const seen = new Set<string>();
  const tooOld = new Set<number>(); // actors whose age ruled them out as this relative in a show already seen (the father George Cooper in Young Sheldon is not Sheldon's brother in Big Bang either)
  const visit = async (show: Show, expand: boolean): Promise<boolean> => {
    if (seen.has(show.key) || seen.size >= 8) return false;
    seen.add(show.key);
    const cast = await getCast(show.type, show.id, 2000).catch(() => []);
    const first = relatives(cast, anchor, rel, () => null);
    if (!first) return false;
    const born = new Map<number, number | null>();
    await pool([first.of, ...first.people].slice(0, 16), 4, async (c) => { born.set(c.id, await loadWhoPerson(c.id).then((p) => (p.birthday ? Number(p.birthday.slice(0, 4)) : null)).catch(() => null)); });
    const rs = relatives(cast, anchor, rel, (id) => born.get(id) ?? null);
    rs?.rejected.forEach((id) => tooOld.add(id));
    if (rs) {
      const of = rs.of.role.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
      for (const c of rs.people.filter((x) => !tooOld.has(x.id)).slice(0, 6)) if (!out.some((o) => o.id === c.id)) out.push({ id: c.id, name: c.name, photo: c.photo, role: c.role, why: `${of}'s ${word}`, show: show.title, tkey: show.key, ttype: show.type });
    }
    if (expand) {
      // The same character in other shows: from what its actors are credited as.
      const actors = cast.filter((c) => roleHas(c.role, anchor)).slice(0, 3);
      const more = await pool(actors, 3, (a) => loadWhoPerson(a.id).then((p) => p.credits.filter((c) => !c.extra && c.key !== show.key && roleHas(c.role, anchor)).sort((x, y) => y.votes - x.votes).slice(0, 3)).catch(() => []));
      for (const c of (more.flat().filter(Boolean) as { key: string; type: MediaType; id: number; title: string }[])) await visit({ key: c.key, type: c.type, id: c.id, title: c.title }, false);
    }
    return true;
  };
  for (const s of seeds) if (await visit(s, true)) break;
  return out.length ? out : null;
}

/**
 * "ted sister" names no show, and the search for "ted" finds Ted Lasso and the films: look through the casts of the most-voted series (How I Met Your Mother is one)
 * for a character with that name, and answer from the first show that has such a relative. Last resort, so only asked when nothing else answered.
 */
async function famousRelation(anchor: string[], rel: Relation, word: string) {
  const pages = await Promise.all([1, 2, 3, 4].map((page) => tmdb("/discover/tv", { sort_by: "vote_count.desc", page: String(page) }, DAY).catch(() => null)));
  const shows: Show[] = pages.flatMap((d) => (d?.results ?? []) as { id: number; name: string }[]).map((r) => ({ key: `tv:${r.id}`, type: "tv" as const, id: r.id, title: r.name }));
  // The show where the character is billed highest (Ted Mosby, the lead of HIMYM, before Ted Wheeler, a side part of Stranger Things).
  const has = await pool(shows, 8, async (s) => { const i = (await getCast(s.type, s.id, 2000).catch(() => [])).findIndex((c) => roleHas(c.role, anchor)); return i < 0 ? null : { s, i }; });
  for (const h of has.filter(Boolean).sort((a, b) => a!.i - b!.i).slice(0, 3)) { const ans = await relationAnswer([h!.s], anchor, rel, word); if (ans) return ans; }
  return null;
}

/** What Wikipedia's cast section says about each character ("a sergeant (later lieutenant)"), to match words like "sergeant" that TMDB's bare names lack. Fails soft; never for a series held back by a spoiler line. */
async function castBlurbs(type: MediaType, id: number, key: string, param: (n: string) => string | null): Promise<Map<string, string>> {
  try {
    if (type === "tv" && (await heldBack(key, param))) return new Map();
    const imdb = await getTitleImdbId(type, id);
    const art = await getArticle((await getWikiFacts(imdb))?.article ?? null);
    const text = (art?.sections ?? []).filter((s) => /^(cast|characters|cast and characters)\b/i.test(s.name)).map((s) => s.text).join("\n");
    return parseCastBlurbs(text);
  } catch { return new Map(); }
}
