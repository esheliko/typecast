import { unstable_cache } from "next/cache";
import { parseSections, type Section } from "./wiki-text";

/** Wikidata + Wikipedia for a title, looked up by IMDb id (no key). Cached a week; every failure is just "nothing known". Server only. */
const UA = { "user-agent": "Typecast/1.0 (personal film and TV tracker)", accept: "application/json" };

export interface WikiFacts { article: string | null; filmedIn: string[]; setIn: string[]; basedOn: string[]; genres: string[] }

const QUERY = (imdb: string) => `
SELECT ?wp (GROUP_CONCAT(DISTINCT ?fl; separator="|") AS ?filmed) (GROUP_CONCAT(DISTINCT ?nl; separator="|") AS ?set)
       (GROUP_CONCAT(DISTINCT ?bl; separator="|") AS ?based) (GROUP_CONCAT(DISTINCT ?gl; separator="|") AS ?genre) WHERE {
  ?f wdt:P345 "${imdb}".
  OPTIONAL { ?a schema:about ?f; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?wp. }
  OPTIONAL { ?f wdt:P915 ?fi. ?fi rdfs:label ?fl. FILTER(LANG(?fl) = "en") }
  OPTIONAL { ?f wdt:P840 ?ni. ?ni rdfs:label ?nl. FILTER(LANG(?nl) = "en") }
  OPTIONAL { { ?f wdt:P144 ?bi } UNION { ?f wdt:P941 ?bi } ?bi rdfs:label ?bl. FILTER(LANG(?bl) = "en") }
  OPTIONAL { ?f wdt:P136 ?gi. ?gi rdfs:label ?gl. FILTER(LANG(?gl) = "en") }
} GROUP BY ?wp LIMIT 1`;

async function fetchFacts(imdb: string): Promise<WikiFacts> {
  const u = new URL("https://query.wikidata.org/sparql");
  u.search = new URLSearchParams({ query: QUERY(imdb), format: "json" }).toString();
  const r = await fetch(u, { headers: { ...UA, accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Wikidata answered ${r.status}`);
  const b = ((await r.json()) as { results?: { bindings?: Record<string, { value: string }>[] } }).results?.bindings?.[0] ?? {};
  const list = (k: string) => (b[k]?.value ?? "").split("|").filter((x) => x && !/^Q\d+$/.test(x)).slice(0, 12);
  return { article: b.wp?.value ?? null, filmedIn: list("filmed"), setIn: list("set"), basedOn: list("based"), genres: list("genre") };
}
/** Next's data cache, or a plain call when there is none (scripts, tests). */
function cached<A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string): (...a: A) => Promise<R> {
  const c = unstable_cache(fn, [key], { revalidate: 7 * 86400 });
  return async (...a) => { try { return await c(...a); } catch (e) { if (/incrementalCache missing/.test(String(e))) return fn(...a); throw e; } };
}

const factsCached = cached(fetchFacts, "wiki-facts-v1");

export async function getWikiFacts(imdb: string | null): Promise<WikiFacts | null> {
  if (!imdb || !/^tt\d+$/.test(imdb)) return null;
  try { return await factsCached(imdb); } catch { return null; }
}

export interface Article { title: string; url: string; sections: Section[] }

async function fetchArticle(title: string): Promise<Article | null> {
  const u = new URL("https://en.wikipedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", prop: "extracts", explaintext: "1", exsectionformat: "wiki", redirects: "1", titles: title, format: "json", formatversion: "2" }).toString();
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Wikipedia answered ${r.status}`);
  const p = ((await r.json()) as { query?: { pages?: { title?: string; extract?: string; missing?: boolean }[] } }).query?.pages?.[0];
  if (!p?.extract || p.missing) return null;
  // Big articles are trimmed; the cache holds the rest.
  return { title: p.title ?? title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent((p.title ?? title).replace(/ /g, "_"))}`, sections: parseSections(p.extract.slice(0, 250_000)) };
}
const articleCached = cached(fetchArticle, "wiki-article-v1");

export async function getArticle(title: string | null): Promise<Article | null> {
  if (!title) return null;
  try { return await articleCached(title); } catch { return null; }
}
