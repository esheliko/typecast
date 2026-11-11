import { inScope } from "./who-scope";
import { sentences, type Section } from "./wiki-text";
import { fmtDate, plural, seasonsLabel } from "./episodes";
import type { Pos } from "./who-types";

/**
 * Pure text work for the Glimpse "About" part: which episodes are in scope, a spoiler-safe biography and character note,
 * and the one-line "where they appear" summary. No AI: the character note is a paragraph of the title's Wikipedia cast list.
 * Unit tested in tests/unit/glimpse-info.test.ts.
 */
export interface Ep { s: number; e: number; name: string; air: string }

/** Episodes inside the Watching-now position (all of them without one). */
export const clipEps = <T extends { s: number; e: number }>(eps: T[], clip: Pos | null): T[] => (clip ? eps.filter((x) => inScope(x.s, x.e, clip)) : eps);

/** Seasons up to the position (a season-only position includes that season; specials stand alone). */
export function clipSeasons(seasons: number[], clip: Pos | null): number[] {
  if (!clip || clip.s == null) return seasons;
  return clip.s === 0 ? seasons.filter((n) => n === 0) : seasons.filter((n) => n > 0 && n <= clip.s!);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const mentions = (text: string, name: string) => { const n = norm(name); return n.length > 2 && ` ${norm(text)} `.includes(` ${n} `); };
const STORY = /\b(season \d+|seasons|episodes?|finale|spin-?off)\b/i;

/** The first `max` sentences of a text, or its first `cap` characters when it has no clean sentences. */
export function firstSentences(text: string, max: number, cap = 360): string {
  const t = text.replace(/\s+/g, " ").trim();
  const ss = sentences(t);
  if (!ss.length) return t.length > cap ? t.slice(0, cap).replace(/\s+\S*$/, "") + "…" : t;
  return ss.slice(0, max).join(" ");
}

/**
 * A biography made short. While `nospoil`, a sentence that names the show being watched (`hide`) or talks about seasons and
 * episodes is dropped, and only the opening is kept, so it never says how a part ends or that someone leaves.
 */
export function safeBio(bio: string, o: { hide?: string; nospoil?: boolean; max?: number } = {}): string {
  const text = (bio ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  let ss = sentences(text);
  if (!ss.length) return o.nospoil ? "" : firstSentences(text, 1);
  if (o.nospoil) ss = ss.filter((s) => !(o.hide && mentions(s, o.hide)) && !STORY.test(s));
  return ss.slice(0, o.max ?? (o.nospoil ? 2 : 4)).join(" ");
}

/**
 * The paragraph of a Wikipedia cast list that is about this character (or this actor as them): "Actor as Character: a chemistry
 * teacher who…". Needs the actor's full name or the character's full name in the paragraph. Returns the note's opening
 * `max` sentences (one while spoilers are off), with the "Actor as Character:" lead-in removed, or null.
 */
export function characterBlurb(secs: Section[], character: string, actor: string, max = 3): { text: string; section: string } | null {
  const ch = character.replace(/\(.*?\)/g, "").trim();
  if (!ch && !actor) return null;
  const chTokens = norm(ch).split(" ").filter((w) => w.length > 2);
  let best: { score: number; text: string; section: string } | null = null;
  for (const sec of secs) {
    if (!/\b(cast|characters?)\b/i.test(sec.name)) continue;
    // A sub-section named after the character ("Cast and characters / Walter White") is about them.
    const named = ch && mentions(sec.name, ch);
    const paras = named ? [sec.text] : sec.text.split(/\n+/);
    for (const raw of paras) {
      const p = raw.replace(/\s+/g, " ").trim();
      if (p.length < 30) continue;
      let score = named ? 3 : 0;
      if (actor && mentions(p, actor)) score += 2;
      if (ch && mentions(p, ch)) score += 2; else if (chTokens.some((w) => mentions(p, w))) score += 1;
      // Both the actor and the character is a sure hit; one alone must be a full name.
      if (score < 2) continue;
      // The lead of the line is the name; a description of someone else who merely mentions them is weaker.
      if (!named && !mentions(p.slice(0, 80), actor) && !(ch && mentions(p.slice(0, 80), ch)) && score < 4) continue;
      if (!best || score > best.score) best = { score, text: p, section: sec.name };
    }
  }
  if (!best) return null;
  let t = best.text;
  const colon = t.indexOf(":");
  if (colon > 0 && colon < 90 && (mentions(t.slice(0, colon), actor) || (ch && mentions(t.slice(0, colon), ch)))) t = t.slice(colon + 1).trim();
  const out = firstSentences(t, max);
  return out.length > 20 ? { text: out, section: best.section } : null;
}

/** "In 24 episodes · seasons 1-3 · first 9 Oct 2011, latest 2 May 2013" (what we can say about where someone appears). */
export function presenceLine(a: { episodes: Ep[]; seasons: number[]; total: number }, upTo?: string): string {
  const eps = a.episodes;
  const parts: string[] = [];
  if (eps.length) parts.push(`${upTo ? "Up to " + upTo + ": " : ""}${plural(eps.length, "episode")}`);
  else if (a.total > 0 && !upTo) parts.push(`About ${plural(a.total, "episode")}`);
  if (a.seasons.length) parts.push(seasonsLabel(a.seasons));
  const dated = eps.filter((x) => x.air);
  if (dated.length) {
    const first = dated[0].air, last = dated[dated.length - 1].air;
    parts.push(first === last ? fmtDate(first) : `first ${fmtDate(first)}, ${upTo ? "latest so far" : "latest"} ${fmtDate(last)}`);
  }
  return parts.join(" · ");
}

/** "Born 3 Mar 1970 in London (54)" / "1950 - 2020, born in …" in one line; "" when TMDB has nothing. */
export function lifeFacts(p: { birthday: string; deathday: string; place: string }, age: number | null): string {
  const b = p.birthday ? fmtDate(p.birthday) : "";
  if (!b && !p.place) return "";
  const where = p.place ? ` in ${p.place}` : "";
  if (p.deathday) return `Born ${b || "(date unknown)"}${where} · died ${fmtDate(p.deathday)}`;
  return `Born ${b || "(date unknown)"}${where}${age != null ? ` · ${age} years old` : ""}`;
}
