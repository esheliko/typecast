import { unstable_cache } from "next/cache";
import { fandomNote, pickFandomPage } from "./glimpse-info";

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
async function nameMatches(wiki: string, title: string): Promise<boolean> {
  const j = await api(wiki, { action: "query", meta: "siteinfo", siprop: "general" });
  const strip = (x: string) => words(x).replace(/\b(wiki|fandom)\b/g, "").replace(/\s+/g, " ").trim().replace(/^the /, "");
  const name = strip(String(j.query?.general?.sitename ?? ""));
  return !!name && name === strip(title);
}

const findWiki = cached(async (imdb: string, title: string): Promise<string | null> => {
  let listed: string[] = [];
  try { listed = imdb ? await wikidataWikis(imdb) : []; } catch { /* fall back to guesses */ }
  const cands = [...new Set([...listed, ...wikiGuesses(title)])].slice(0, 8);
  const ok = await Promise.all(cands.map((w) => nameMatches(w, title).catch(() => false)));
  const i = ok.indexOf(true);
  return i >= 0 ? cands[i] : null;
}, "fandom-wiki-v2");

const noteFor = cached(async (wiki: string, character: string): Promise<{ text: string; title: string } | null> => {
  const s = await api(wiki, { action: "query", list: "search", srsearch: character, srlimit: "6", srnamespace: "0" });
  const page = pickFandomPage(((s.query?.search ?? []) as { title: string }[]).map((x) => x.title), character);
  if (!page) return null;
  const e = await api(wiki, { action: "query", prop: "extracts", exintro: "1", explaintext: "1", redirects: "1", titles: page });
  const text = String(e.query?.pages?.[0]?.extract ?? "");
  return text ? { text: text.slice(0, 4000), title: page } : null;
}, "fandom-note-v1");

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
