import { getAppearances, tmdb } from "./tmdb";
import { getArticle, getWikiFacts } from "./wiki";
import { loadBrief, loadWhoPerson } from "./who-data";
import { ageAt } from "./who-dates";
import { charOf } from "./glimpse";
import { characterBlurb, minorRole, RISKY, clipEps, clipSeasons, lifeFacts, presenceLine, safeBio, type Ep } from "./glimpse-info";
import { posLabel } from "./who-scope";
import { plural, showLine } from "./episodes";
import { getFandomNote } from "./fandom";
import { sentences } from "./wiki-text";
import type { MediaType } from "./types";
import type { Pos } from "./who-types";

/** Server side of the Glimpse About part: a title's summary, a person's summary, or a person's part in a title. Read-only TMDB + Wikipedia work, soft failures. */
export interface AboutTitle { name: string; year: string; kind: "film" | "series"; overview: string; line: string }
export interface AboutPerson { name: string; line: string; bio: string; /** The biography was trimmed for spoilers. */ cut: boolean }
export interface AboutRole {
  character: string;
  /** The title's name, for a web search link when no description is found. */
  show: string;
  /** A short note on the character from the title's Wikipedia cast list. */
  summary: string | null; source: { label: string; url: string } | null;
  /** True when the note was cut short (or left out) so it does not give the story away. */
  short: boolean;
  /** A fuller note exists but was held back for spoilers (the panel offers to show it). */
  withheld: boolean;
  episodes: Ep[]; seasons: number[]; line: string;
  /** A regular is listed by season, not by episode: each season they are in, its size and first air date (`upTo` = only that many episodes so far). */
  seasonRows: { n: number; eps: number; air: string; upTo?: number }[];
  /** Why the list stops where it does: "Up to S2 E8 only" under the spoiler rules. */
  note: string | null;
}
/** `limited`: something was held back for spoilers; the panel then offers to show it anyway (`full=1`). */
export interface GlimpseAbout { title?: AboutTitle; person?: AboutPerson; role?: AboutRole; limited?: boolean }

export interface AboutQuery { type?: MediaType; id?: number; pid?: number; char?: string; clip: Pos | null; nospoil: boolean; hide?: string;
  /** The title is marked fully watched in the library: everything is told, whatever the position or the No spoilers switch. Anything else is told conservatively. */
  watched?: boolean }

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

async function aboutTitle(type: MediaType, id: number, q: AboutQuery): Promise<AboutTitle> {
  const b = await loadBrief(type, id);
  // Not marked fully watched: only what the premise says, no season counts or "ended" (how far it goes is a spoiler too).
  const line = !q.watched
    ? [b.year, b.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")
    : type === "tv"
      ? [showLine({ first: b.first, last: b.last, seasons: b.seasons.filter((s) => s.n > 0).length, episodes: b.seasons.reduce((n, s) => n + (s.n > 0 ? s.eps : 0), 0), status: b.status, next: null, latest: null }), b.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")
      : [b.year, b.runtime ? `${b.runtime} min` : "", b.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  return { name: b.title, year: b.year, kind: type === "tv" ? "series" : "film", overview: b.overview, line };
}

async function aboutPerson(pid: number, q: AboutQuery): Promise<AboutPerson> {
  const d = await tmdb(`/person/${pid}`, {}, 24 * 3600);
  const today = new Date().toISOString().slice(0, 10);
  const facts = { birthday: d.birthday ?? "", deathday: d.deathday ?? "", place: d.place_of_birth ?? "" };
  const bio = safeBio(d.biography ?? "", { hide: q.hide, nospoil: q.nospoil });
  const cut = q.nospoil && bio !== safeBio(d.biography ?? "", {});
  return { name: d.name ?? "", line: lifeFacts(facts, facts.deathday ? null : ageAt(facts.birthday, today)), bio, cut };
}

async function aboutRole(type: MediaType, id: number, pid: number, q: AboutQuery): Promise<{ role: AboutRole | null; person: AboutPerson | null }> {
  const key = `${type}:${id}`;
  const [brief, p] = await Promise.all([loadBrief(type, id), loadWhoPerson(pid)]);
  const credit = p.credits.find((c) => c.key === key);
  const character = (q.char || charOf(credit?.role) || "").trim();
  if (!credit && !character) return { role: null, person: await aboutPerson(pid, q).catch(() => null) };

  // Not marked fully watched: told conservatively (one sentence with no deaths, twists or endings) and, for the show being watched, cut at the position.
  const safe = !q.watched;
  const clip = safe ? q.clip : null;
  // The character note: a paragraph of the Wikipedia cast list, else the show's Fandom wiki. A slow answer is skipped (it is cached for next time).
  const blurbFor = (safe: boolean) => within((async () => {
    const wf = await getWikiFacts(brief.imdbId);
    // The show's article, then the separate "List of … characters" article that long-running shows have.
    const arts: NonNullable<Awaited<ReturnType<typeof getArticle>>>[] = [];
    for (const name of [wf?.article ?? null, `List of ${brief.title} characters`]) {
      const art = await getArticle(name);
      if (!art) continue;
      arts.push(art);
      const hit = character ? characterBlurb(art.sections, character, p.name, 3) : null;
      const text = hit && (safe ? sentences(hit.text).find((x) => !RISKY.test(x)) ?? null : hit.text);
      if (text) return { text, label: `Wikipedia: ${art.title}`, url: art.url };
    }
    // The show's Fandom wiki (often far more detailed). A small part is listed on Wikipedia under another name ("Howie Lee" for TMDB's
    // "Sushi Master"): that name is tried on the wiki too, and the bare Wikipedia cast line is the last resort.
    const minor = arts.map((a) => minorRole(a.sections, p.name)).find(Boolean) ?? null;
    for (const name of [character, minor?.role].filter((x): x is string => !!x)) {
      const f = await getFandomNote(brief.imdbId, brief.title, name, safe);
      if (f) return f;
    }
    const art = arts[0];
    return minor && art ? { text: minor.text, label: `Wikipedia: ${art.title}`, url: art.url } : null;
  })(), 6000);
  const blurb = blurbFor(safe);
  // Only when the careful version differs from the full one is there anything to offer; both come from the same cached lookups.
  const fullBlurb = safe ? blurbFor(false) : null;

  let episodes: Ep[] = []; let seasons: number[] = []; let total = 0; let note: string | null = null;
  if (type === "tv" && credit?.cids.length) {
    const a = await getAppearances(id, credit.cids, credit.eps).catch(() => null);
    if (a) {
      total = a.total;
      episodes = clipEps(a.episodes.filter((x) => x.s > 0).map((x): Ep => ({ s: x.s, e: x.e, name: x.name, air: x.air })), clip);
      seasons = clipSeasons(a.seasons, clip);
      if (clip) note = clip.s == null ? "The season is not set, so this covers the whole series." : `Up to ${posLabel(clip)} only, so nothing later is told.`;
    }
  }
  const w = await blurb;
  const wf = fullBlurb ? await fullBlurb : null;
  const upTo = clip && clip.s != null ? posLabel(clip) : undefined;
  const line = type === "tv" ? presenceLine({ episodes, seasons, total: clip ? 0 : total }, upTo) : "";
  const role: AboutRole = {
    character, show: brief.title, summary: w?.text ?? null, source: w ? { label: w.label, url: w.url } : null, short: !!w && safe, withheld: !!wf && wf.text !== w?.text,
    episodes, seasons, line: line || (type === "tv" && credit?.eps ? plural(credit.eps, "episode") : ""), note,
    seasonRows: !episodes.length ? brief.seasons.filter((s) => seasons.includes(s.n) && s.n > 0).map((s) => ({ n: s.n, eps: s.eps, air: s.air, ...(clip && clip.s === s.n && clip.e != null ? { upTo: clip.e } : {}) })) : [],
  };
  return { role, person: null };
}

export async function loadAbout(q: AboutQuery): Promise<GlimpseAbout> {
  const a = await loadAboutRaw(q);
  const limited = a.role ? a.role.withheld : a.person ? a.person.cut : false;
  return limited ? { ...a, limited } : a;
}

async function loadAboutRaw(q: AboutQuery): Promise<GlimpseAbout> {
  const { type, id, pid } = q;
  if (type && id && pid) {
    const [r, t] = await Promise.all([aboutRole(type, id, pid, q), aboutTitle(type, id, q).catch(() => null)]);
    // A character's panel is about the character: the film's own summary is only the fallback when there is no role at all.
    return { ...(r.role ? { role: r.role } : {}), ...(t && !r.role ? { title: t } : {}), ...(r.person ? { person: r.person } : {}) };
  }
  if (type && id) return { title: await aboutTitle(type, id, q) };
  if (pid) return { person: await aboutPerson(pid, q) };
  return {};
}
