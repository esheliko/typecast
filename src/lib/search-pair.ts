import { exactTitle, layoutSearch, nameTier } from "./search-intent";
import type { SearchHit } from "./types";

/** "tom hanks + meg ryan", "heat and the irishman", "a vs b", "a, b": the two sides of a connection typed into the search box. */
const SEP = /\s*[+&×,/]\s*|\s+(?:and|with|vs\.?|versus)\s+/i;

export function splitPair(raw: string): [string, string] | null {
  const parts = raw.trim().split(SEP).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2 || parts.some((p) => p.length < 2)) return null;
  return [parts[0], parts[1]];
}

/** No separator ("richard gere edward norton", "how i met your mother breaking bad"): every way to cut 3-9 words into two sides, the most even cut first. The caller keeps a cut only when BOTH sides are an exact name. */
export function splitCandidates(raw: string): [string, string][] {
  if (SEP.test(raw.trim())) return [];
  const w = raw.trim().split(/\s+/).filter(Boolean);
  if (w.length < 3 || w.length > 9) return [];
  const cuts: [string, string][] = [];
  for (let i = 1; i < w.length; i++) cuts.push([w.slice(0, i).join(" "), w.slice(i).join(" ")]);
  const mid = w.length / 2;
  return cuts.sort((a, b) => Math.abs(a[0].split(" ").length - mid) - Math.abs(b[0].split(" ").length - mid));
}

/**
 * The two sides of a guessed cut ("rumble fish | erin brockovich"), given the search hits of each side. Both sides must be an exact name.
 * First choice: each side's clear Top result, when both are the same kind. Otherwise both sides as titles, because a name can be a person AND a film
 * ("erin brockovich") and a little-known film is never a Top result ("rumble fish"). Never a person next to a title.
 */
export function pickPair(l: string, r: string, hl: SearchHit[], hr: SearchHit[]): [SearchHit, SearchHit] | null {
  const exact = (h: SearchHit, s: string) => nameTier(s, h.kind === "person" ? h.name : h.title) === 4;
  const a = layoutSearch(l, hl).top, b = layoutSearch(r, hr).top;
  if (a && b && a.kind === b.kind && exact(a, l) && exact(b, r)) return [a, b];
  const x = exactTitle(l, hl), y = exactTitle(r, hr);
  return x && y ? [x, y] : null;
}
