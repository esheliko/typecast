import { unstable_cache } from "next/cache";
import { fandomNote, introFromHtml, pickFandomPage } from "./glimpse-info";
import { pageIsSeason, parseWikiCameos, parseWikiCast, type WikiCastEntry } from "./wiki-cast";

/**
 * Character notes from a show's Fandom wiki (MediaWiki API, no key). The wiki is found through Wikidata's "Fandom article ID" (P6262) by IMDb id,
 * else guessed from the title and checked against the wiki's own name. Cached a week; every failure is just "nothing known". Server only.
 * Fandom text is CC-BY-SA: callers show the page link beside it.
 */
const UA = { "user-agent": "Typecast/1.0 (personal film and TV tracker)", accept: "application/json" };
const WIKI = /^[a-z0-9][a-z0-9-]{1,60}$/;

export interface FandomNote { text: string; label: string; url: string }

const cached = <A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string): ((...a: A) => Promise<R>) => {
  const c = unstable_cache(fn, [key], { revalidate: 7 * 86400 });
  return async (...a) => { try { return await c(...a); } catch (e) { if (/incrementalCache missing|Invariant/.test(String(e))) return fn(...a); throw e; } };
};

const api = async (wiki: string, params: Record<string, string>) => {
  const u = new URL(`https://${wiki}.fandom.com/api.php`);
  u.search = new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Fandom answered ${r.status}`);
  return r.json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** Every English wiki Wikidata lists for the show (it may list several, plus other languages and unrelated wikis: they are checked by name below). */
async function wikidataWikis(imdb: string): Promise<string[]> {
  const u = new URL("https://query.wikidata.org/sparql");
  u.search = new URLSearchParams({ query: `SELECT ?fd WHERE { ?f wdt:P345 "${imdb}". ?f wdt:P6262 ?fd. } LIMIT 12`, format: "json" }).toString();
  const r = await fetch(u, { headers: { ...UA, accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return [];
  const rows = ((await r.json()) as { results?: { bindings?: { fd?: { value: string } }[] } }).results?.bindings ?? [];
  return [...new Set(rows.map((b) => (b.fd?.value ?? "").split(":")[0].toLowerCase()).filter((w) => WIKI.test(w)))];
}

const words = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Where a show's wiki is likely to live: "howimetyourmother", "how-i-met-your-mother", "himym" (initials of a long title), each with and without a leading "the". */
export function wikiGuesses(title: string): string[] {
  const ws = words(title).split(" ").filter(Boolean);
  const bare = ws[0] === "the" && ws.length > 1 ? ws.slice(1) : ws;
  const out: string[] = [];
  for (const w of [ws, bare]) {
    out.push(w.join(""), w.join("-"));
    if (w.length >= 3) out.push(w.map((x) => x[0]).join(""));
  }
  return [...new Set(out)].filter((x) => WIKI.test(x));
}

/** A candidate counts only if the wiki's own name is the title ("How I Met Your Mother Wiki"), so a lookalike address never lands on an unrelated wiki. */
export function siteNameMatches(sitename: string, title: string, listed: boolean): boolean {
  const strip = (x: string) => words(x).replace(/\b(wiki|fandom)\b/g, "").replace(/\s+/g, " ").trim().replace(/^the /, "");
  const name = strip(sitename), t = strip(title);
  if (!name || !t) return false;
  if (name === t) return true;
  // Wikidata itself lists this wiki for the show, so "Lostpedia" is the show's wiki too.
  return listed && (name.replace(/pedia$/, "") === t);
}

async function nameMatches(wiki: string, title: string, listed = false): Promise<boolean> {
  const j = await api(wiki, { action: "query", meta: "siteinfo", siprop: "general" });
  return siteNameMatches(String(j.query?.general?.sitename ?? ""), title, listed);
}

const findWiki = cached(async (imdb: string, title: string): Promise<string | null> => {
  let listed: string[] = [];
  try { listed = imdb ? await wikidataWikis(imdb) : []; } catch { /* fall back to guesses */ }
  const cands = [...new Set([...listed, ...wikiGuesses(title)])].slice(0, 8);
  const ok = await Promise.all(cands.map((w) => nameMatches(w, title, listed.includes(w)).catch(() => false)));
  const i = ok.indexOf(true);
  return i >= 0 ? cands[i] : null;
}, "fandom-wiki-v3");

const noteFor = cached(async (wiki: string, character: string): Promise<{ text: string; title: string } | null> => {
  const s = await api(wiki, { action: "query", list: "search", srsearch: character, srlimit: "10", srnamespace: "0" });
  const page = pickFandomPage(((s.query?.search ?? []) as { title: string }[]).map((x) => x.title), character);
  if (!page) return null;
  // `action=parse` of the intro: many Fandom wikis do not have the TextExtracts extension (`prop=extracts` answers nothing there).
  const e = await api(wiki, { action: "parse", page, prop: "text", section: "0", redirects: "1", disabletoc: "1", disableeditsection: "1" });
  const text = introFromHtml(String(e.parse?.text ?? ""));
  return text ? { text: text.slice(0, 4000), title: String(e.parse?.title ?? page) } : null;
}, "fandom-note-v3");

/** The character's note from the show's Fandom wiki, made safe to show (see `fandomNote`), or null. */
export async function getFandomNote(imdb: string | null, show: string, character: string, safe: boolean, max = 3): Promise<FandomNote | null> {
  try {
    const wiki = await findWiki(imdb ?? "", show);
    if (!wiki) return null;
    const n = await noteFor(wiki, character);
    const text = n && fandomNote(n.text, character, { safe, max });
    return n && text ? { text, label: `Fandom: ${n.title}`, url: `https://${wiki}.fandom.com/wiki/${encodeURIComponent(n.title.replace(/ /g, "_"))}` } : null;
  } catch { return null; }
}

const castOf = cached(async (wiki: string, title: string, season: number): Promise<WikiCastEntry[]> => {
  for (const page of [title, `${title} (episode)`]) {
    try {
      const j = await api(wiki, { action: "parse", page, prop: "wikitext", redirects: "1" });
      const w = String(j.parse?.wikitext ?? "");
      if (w && pageIsSeason(w, season)) { const c = parseWikiCast(w);
        const seen = new Set(c.map((x) => words(x.name)));
        for (const x of parseWikiCameos(w)) if (!seen.has(words(x.name))) c.push(x);
        if (c.length) return c; }
    } catch { /* no such page: try the next title */ }
  }
  return [];
}, "fandom-ep-cast-v2");

/** Everyone the show's Fandom wiki lists for an episode (main, guest and co-starring), or [] when the wiki or page is unknown or unreachable. */
export async function getFandomEpisodeCast(imdb: string | null, show: string, season: number, episodeTitle: string): Promise<WikiCastEntry[]> {
  try {
    if (!episodeTitle.trim()) return [];
    const wiki = await findWiki(imdb ?? "", show);
    return wiki ? await castOf(wiki, episodeTitle.trim(), season) : [];
  } catch { return []; }
}
