import { normName } from "./tvmaze";

/**
 * Pure helpers for reading an episode's cast off a show's Fandom wiki page (wikitext). Typical shape:
 *   ==Cast==  ===Main===  *[[Shawn Ashmore]] as [[Wesley Evers]]   ===Guest starring===  *Myk Watford as FBI Agent
 * Every sub-section (Main, Guest starring, Co-starring, ...) counts: all of them appear in the episode.
 */
export interface WikiCastEntry { name: string; role: string }

const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];

/** `[[A|B]]` -> B, `[[A]]` -> A, templates, refs, bold/italics and html removed. */
export function plainWiki(s: string): string {
  return s.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/\{\{[^}]*\}\}/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "").replace(/'{2,}/g, "").replace(/\s+/g, " ").trim();
}

/** The people listed under the page's "Cast" heading. Empty when there is no such section. */
export function parseWikiCast(wikitext: string): WikiCastEntry[] {
  const m = /^==\s*Cast\s*==\s*$/im.exec(wikitext);
  if (!m) return [];
  const rest = wikitext.slice(m.index + m[0].length);
  const end = rest.search(/^==(?!=)/m);
  const body = end >= 0 ? rest.slice(0, end) : rest;
  const out: WikiCastEntry[] = [];
  const seen = new Set<string>();
  for (const line of body.split("\n")) {
    const l = /^\s*\*+\s*(.+)$/.exec(line)?.[1];
    if (!l) continue;
    const i = l.search(/\s+as\s+/i);
    const name = plainWiki(i >= 0 ? l.slice(0, i) : l);
    const role = i >= 0 ? plainWiki(l.slice(i).replace(/^\s+as\s+/i, "")) : "";
    const k = normName(name);
    if (!k || name.length > 60 || name.split(" ").length > 6 || seen.has(k)) continue;
    seen.add(k); out.push({ name, role });
  }
  return out;
}

/**
 * People the Cast list leaves out but a Trivia or plot line names as appearing: "Captain [[Zoe Andersen]] ([[Mercedes Mason]]) makes an
 * uncredited appearance delivering a speech". Needs an appearance word and the actor in a link inside brackets right after the character,
 * so ordinary parentheses never match.
 */
export function parseWikiCameos(wikitext: string): WikiCastEntry[] {
  const out: WikiCastEntry[] = [];
  const seen = new Set<string>();
  for (const line of wikitext.split("\n")) {
    if (!/\b(?:uncredited|cameo|appearance|appears?|guest|briefly|seen|voice)\b/i.test(line)) continue;
    const re = /((?:\[\[[^\]]+\]\]|[A-Z][\w.'’-]*)(?:\s+(?:\[\[[^\]]+\]\]|[A-Z][\w.'’-]*)){0,3})\s*\(\s*\[\[(?:[^\]|]*\|)?([^\]|]+)\]\]\s*\)/g;
    for (const m of line.matchAll(re)) {
      const name = plainWiki(m[2]);
      const k = normName(name);
      if (!k || name.split(" ").length < 2 || name.split(" ").length > 4 || seen.has(k)) continue;
      seen.add(k); out.push({ name, role: plainWiki(m[1]) });
    }
  }
  return out;
}

/** Does the page say it is an episode of that season ("third season", "[[Season 3", "season 3")? Guards against a same-titled non-episode page. */
export function pageIsSeason(wikitext: string, season: number): boolean {
  const re = new RegExp(`(\\[\\[season ${season}\\b|\\bseason ${season}\\b${ORD[season] ? `|\\b${ORD[season]} season\\b` : ""})`, "i");
  return re.test(wikitext);
}
