/** "Did you mean": a last-resort spelling fix for a title TMDB cannot find at all ("Plesentvill"). Server only; fails soft (returns null). */

/** The spelling Wikipedia's search suggests, from its API answer. `null` when it has none. */
export function parseSuggestion(j: unknown): string | null {
  const s = (j as { query?: { searchinfo?: { suggestion?: unknown } } } | null)?.query?.searchinfo?.suggestion;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

/** Ask Wikipedia how it would spell `q`. Nothing is sent but the typed title, and any failure or slow answer just means no suggestion. */
export async function suggestSpelling(q: string): Promise<string | null> {
  try {
    const u = new URL("https://en.wikipedia.org/w/api.php");
    u.search = new URLSearchParams({ action: "query", list: "search", srsearch: q, srinfo: "suggestion", srprop: "", srlimit: "1", format: "json", formatversion: "2" }).toString();
    const r = await fetch(u, { headers: { "user-agent": "Typecast/1.0 (personal film and TV tracker)", accept: "application/json" }, signal: AbortSignal.timeout(4000), next: { revalidate: 60 * 60 * 24 } });
    return r.ok ? parseSuggestion(await r.json()) : null;
  } catch { return null; }
}
