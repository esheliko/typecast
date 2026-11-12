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

/**
 * Last resort for a film whose cast list is only "Actor as Character" (no description): the plot summary sentence that says who the
 * character is ("Sean is a detective with the State Police whose wife left him"). Needs the character named by full name or by a
 * first/last name with "is/was a(n)" right after it; a mere mention in a list of names ("Jimmy, Sean and Dave are playing") is not a description.
 */
export function plotNote(secs: Section[], character: string): { text: string; section: string } | null {
  const ch = character.replace(/\(.*?\)/g, "").replace(/["“”].*?["“”]/g, "").trim();
  const parts = norm(ch).split(" ").filter((w) => w.length > 2);
  if (!parts.length) return null;
  const names = [...new Set([parts.join(" "), parts[0], parts[parts.length - 1]])].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(?:${names.join("|")})\\b[^.]{0,12}?\\b(?:is|was|,?\\s+an?|,?\\s+the)\\s`, "i");
  for (const sec of secs) {
    if (!/\b(plot|synopsis|premise)\b/i.test(sec.name)) continue;
    for (const raw of sec.text.split(/\n+/)) {
      const hit = sentences(raw.replace(/\s+/g, " ")).find((x) => re.test(x) && x.length > 30);
      if (!hit) continue;
      // "25 years later, Jimmy is an ex-convict and Sean is a detective…": keep the clause about this character when the sentence is a chain.
      return { text: hit.replace(/^(?:\d+ years later|[A-Z][a-z]+ years later),\s*/, ""), section: sec.name };
    }
  }
  return null;
}

/**
 * Small parts are one clause in a run-on cast line ("Hy Pyke as Taffey Lewis, Robert Okazaki as Howie Lee, ..."), often under another
 * first name or role name than TMDB uses ("Bob" vs "Robert", "Sushi Master" vs "Howie Lee"). Match on the actor's surname in an
 * "<Given name> <Surname> as <role>" clause and give back just that clause, so the panel has something true instead of nothing, and the role name it gives ("Howie Lee") is a better search word for the show's wiki than TMDB's "Sushi Master". Used after Fandom, never before it.
 */
export function minorRole(secs: Section[], actor: string): { text: string; role: string; section: string } | null {
  const last = actor.trim().split(/\s+/).pop() ?? "";
  if (norm(last).length < 4) return null;
  const name = String.raw`(?:[A-Z][\w.'’-]+\s+){1,3}`;
  const re = new RegExp(`(${name}${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s+as\\s+([^;.\\n]+?)(?=,\\s+(?:and\\s+)?${name}as\\s|;|\\.\\s|\\n|$)`);
  for (const sec of secs) {
    if (!/\b(cast|characters?)\b/i.test(sec.name)) continue;
    const m = re.exec(sec.text);
    if (m && m[2].trim().length > 2) return { text: `${m[1].trim()} as ${m[2].trim()}.`, role: m[2].trim(), section: sec.name };
  }
  return null;
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

/** Words that give a story away: deaths, betrayals, twists, how things end, what happens "later". */
export const RISKY = /\b(dies?|died|dead|death|deaths|kill(s|ed|ing)?|murder(s|ed)?|betray(s|ed|al)?|reveal(s|ed)?|twist|finale|seasons?|episodes?|eventually|later|ultimately|turns? out|final(ly)?|fate|sacrific\w*|survive[sd]?|arrest(s|ed)?|leaves?|left|returns?|replaced|married|pregnan\w*|cancer|diagnos\w*)\b/i;

/**
 * A character page's opening from a fan wiki, made safe to show. `safe` (the title is not marked fully watched): the first sentence that
 * names no death, twist, season or ending; nothing at all when every sentence is risky. Otherwise the first `max` sentences as written.
 * The page must be about the character (their name, or its first or last word, in the text), else null.
 */
export function fandomNote(text: string, character: string, o: { safe: boolean; max?: number }): string | null {
  const t = (text ?? "").replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  const ch = character.replace(/\(.*?\)/g, "").trim();
  if (!t || !ch) return null;
  const toks = norm(ch).split(" ").filter((w) => w.length > 2);
  if (!(mentions(t, ch) || toks.some((w) => mentions(t.slice(0, 300), w)))) return null;
  const ss = sentences(t);
  if (!ss.length) return o.safe ? null : firstSentences(t, 1);
  if (o.safe) { const s = ss.find((x) => !RISKY.test(x)); return s ?? null; }
  return ss.slice(0, o.max ?? 3).join(" ");
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };

/**
 * The opening text of a wiki page from its rendered intro HTML (MediaWiki `action=parse`, section 0): the paragraphs only, with the infobox,
 * figures, tables, scripts and footnote marks dropped. Fandom wikis often lack the TextExtracts extension, so this is how their text is read.
 */
export function introFromHtml(html: string): string {
  const clean = (html ?? "")
    .replace(/<(aside|figure|table|style|script|sup|div class="(?:notice|toc)[^"]*")[\s\S]*?<\/(?:aside|figure|table|style|script|sup|div)>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const paras = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&([a-z]+);/gi, (x, n) => ENT[n.toLowerCase()] ?? x)
    .replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim());
  return paras.filter((x) => x.length > 20).join("\n");
}

/** Spelled alike: same first letter and at most 1 edit (2 for words of 5+ letters): "Howie" and "Howey". */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || a[0] !== b[0]) return false;
  const max = Math.min(a.length, b.length) >= 5 ? 2 : 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** The best page for a character among a wiki search's hits: an exact title wins, then one that holds all the name's words. Skips lists, galleries and other namespaces. */
export function pickFandomPage(titles: string[], character: string): string | null {
  const ch = norm(character.replace(/\(.*?\)/g, ""));
  if (!ch) return null;
  const toks = ch.split(" ").filter((w) => w.length > 2);
  const ok = titles.filter((t) => !/[:/]/.test(t) && !/\b(list|gallery|quotes|trivia|episodes?|season|relationships?)\b/i.test(t));
  const exact = ok.find((t) => norm(t) === ch);
  if (exact) return exact;
  return ok.find((t) => { const n = norm(t); return toks.length > 0 && toks.every((w) => n.split(" ").includes(w)) && n.split(" ").length <= toks.length + 2; })
    // Wikis spell names their own way ("Howey Lee" for "Howie Lee").
    ?? ok.find((t) => { const nt = norm(t).split(" "); return toks.length > 0 && nt.length <= toks.length + 1 && toks.every((w) => nt.some((x) => near(w, x))); }) ?? null;
}
