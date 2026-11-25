/**
 * "rumble fish matrix" typed into a person picker: the words are film/series titles and the
 * wanted people are those who appear in all of them. Pure helpers; the TMDB calls live in `tmdb.ts`.
 */

export const normTitle = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/^(the|a|an) /, "");

/** Every way to cut the words into 2 or 3 consecutive parts (each part is a possible title). Max 6 words. */
export function titleSplits(q: string, maxParts = 3): string[][] {
  const w = q.trim().split(/\s+/).filter(Boolean);
  if (w.length < 2 || w.length > 6) return [];
  const out: string[][] = [];
  const cut = (from: number, parts: string[]) => {
    if (from === w.length) { if (parts.length >= 2) out.push(parts); return; }
    if (parts.length >= maxParts) return;
    for (let to = from + 1; to <= w.length; to++) cut(to, [...parts, w.slice(from, to).join(" ")]);
  };
  cut(0, []);
  // Fewer, longer titles first: "rumble fish | matrix" before "rumble | fish | matrix".
  return out.sort((a, b) => a.length - b.length);
}

/** True when a title found on TMDB is the one the user typed (ignoring case, accents, punctuation and a leading "The"). */
export const sameTitle = (typed: string, found: string) => normTitle(typed) !== "" && normTitle(typed) === normTitle(found);

/** The ids present in every list, in the order of the first list. */
export function commonIds(lists: number[][]): number[] {
  if (!lists.length) return [];
  const rest = lists.slice(1).map((l) => new Set(l));
  return [...new Set(lists[0])].filter((id) => rest.every((s) => s.has(id)));
}
