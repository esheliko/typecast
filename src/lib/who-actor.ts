import { roleLabel } from "./roster";
import type { PCredit } from "./who-types";

/** Pure logic for "Who's that?" with no title chosen: an actor's name plus a part or title you remember ("george clooney as criminal", "kate winslet spotless mind", "emmy rossum fiona"). Unit tested in tests/unit/who-actor.test.ts. */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

const FILLER = new Set(["as", "in", "playing", "plays", "played", "role", "a", "an", "the", "of", "movie", "film", "show", "series"]);

/** Ways a part is described that TMDB's character names ("Attorney Pelly", "Prison Guard") spell differently. */
const SAME: Record<string, string[]> = {
  lawyer: ["attorney", "counsel", "counselor", "barrister", "solicitor", "da", "prosecutor", "judge", "defense", "courtroom", "trial", "legal", "law"],
  criminal: ["thief", "robber", "convict", "inmate", "prisoner", "gangster", "mobster", "mafia", "crook", "killer", "burglar", "outlaw", "bandit", "crime", "heist", "robbery", "prison"],
  cop: ["officer", "detective", "sheriff", "police", "deputy", "inspector", "trooper"],
  police: ["officer", "detective", "sheriff", "cop", "deputy", "inspector"],
  doctor: ["dr", "surgeon", "physician", "nurse"],
  teacher: ["professor", "principal", "coach"],
  soldier: ["captain", "sergeant", "lieutenant", "colonel", "major", "general", "private"],
  asian: ["chinese", "japanese", "korean", "thai", "vietnamese", "indian"],
  restaurant: ["diner", "cafe", "waiter", "waitress", "hostess", "chef", "bistro"],
  magician: ["magic", "wizard", "witch", "sorcerer", "illusionist", "warlock", "magical"],
  wizard: ["magic", "magician", "witch", "sorcerer", "warlock", "wizardry", "hogwarts", "magical"],
  villain: ["killer", "mobster", "gangster", "boss"],
};

/** Edit distance (small strings only). */
export function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const slack = (n: number) => (n >= 8 ? 2 : n >= 5 ? 1 : 0);
/** Is the typed word `w` (possibly misspelt: "harlson", "radcliff") the start of, or a near miss of, the word `x`? Short words must match exactly. */
export function near(w: string, x: string): boolean {
  if (x.startsWith(w)) return true;
  const k = slack(w.length);
  return k > 0 && (lev(w, x) <= k || lev(w, x.slice(0, w.length)) <= 1);
}

/** Every run of 1-3 typed words, for asking TMDB who they might be ("woody harlson", "daniel radcliff"). Longest first; at most the first 6 words are looked at. */
export function nameWindows(q: string): string[] {
  const qw = words(q).slice(0, 6);
  const out: string[] = [];
  for (const n of [2, 3, 1]) for (let i = 0; i + n <= qw.length; i++) { const w = qw.slice(i, i + n); if (n === 1 && (w[0].length < 4 || FILLER.has(w[0]))) continue; out.push(w.join(" ")); if (n === 1 && w[0].length >= 6) out.push(w[0].slice(0, -1)); }
  return [...new Set(out)];
}

/**
 * The person whose full name appears anywhere in the query, allowing small misspellings (longest, then closest, wins), and the words left over. "wizard daniel radcliff" -> Daniel Radcliffe + "wizard".
 * With `partial`, a single typed word may be just ONE word of a name (a surname or first name, misspelt or cut short: "radclif wizard"); the most popular such person wins.
 */
export function splitActorQuery<P extends { name: string; popularity?: number }>(q: string, people: readonly P[], opts: { partial?: boolean } = {}): { person: P; rest: string[] } | null {
  if (opts.partial) {
    const qw = words(q);
    let best: { person: P; at: number; pop: number } | null = null;
    for (const p of people) {
      const nw = words(p.name);
      qw.forEach((w, at) => {
        if (w.length < 4 || FILLER.has(w) || !nw.some((x) => x === w || near(w, x))) return;
        const pop = p.popularity ?? 0;
        if (pop < 2) return; // a half-typed name only for someone well known, not any TMDB person called "Asian" or "Wizard"
        if (!best || pop > best.pop) best = { person: p, at, pop };
      });
    }
    const b = best as { person: P; at: number } | null;
    return b ? { person: b.person, rest: qw.filter((_, i) => i !== b.at).filter((w) => !FILLER.has(w)) } : null;
  }
  const qw = words(q);
  let best: { person: P; n: number; d: number; at: number } | null = null;
  for (const p of people) {
    const nw = words(p.name);
    if (!nw.length || nw.length > qw.length) continue;
    if (nw.length === 1 && (p.popularity ?? 0) < 1) continue; // a one-word name only when it is a star (Cher), not any "Wizard" TMDB lists
    for (let at = 0; at + nw.length <= qw.length; at++) {
      let d = 0, ok = true;
      for (let i = 0; i < nw.length && ok; i++) {
        const a = qw[at + i], b = nw[i];
        if (a === b) continue;
        const e = lev(a, b);
        if (a.length >= 4 && e <= (b.length >= 6 ? 2 : 1) && a[0] === b[0]) d += e; else ok = false;
      }
      if (ok && (!best || nw.length > best.n || (nw.length === best.n && d < best.d))) best = { person: p, n: nw.length, d, at };
    }
  }
  if (!best) return null;
  return { person: best.person, rest: qw.filter((_, i) => i < best!.at || i >= best!.at + best!.n).filter((w) => !FILLER.has(w)) };
}

const THE = /^(the|a|an)\s+/i;
/** Initials of a title ("How I Met Your Mother" -> "himym", "The Big Bang Theory" -> "tbbt"). */
export const initials = (title: string): string => words(title).map((w) => w[0]).join("");

/**
 * The title named anywhere in the query, and the words left over. The typed words must follow the title's own words in order ("hunger games haymitch", "kev shameless",
 * "sienfeld ..."), may stop short of its end when at least two words match ("big bang sheldon mom" -> The Big Bang Theory), may be misspelt, or may be its initials ("himym").
 * The most words matched wins, then the more popular.
 */
export function splitTitleQuery<T extends { title: string; popularity?: number }>(q: string, titles: readonly T[]): { title: T; rest: string[] } | null {
  const qw = words(q);
  let best: { t: T; k: number; at: number; score: number } | null = null;
  for (const t of titles) {
    const tw = words(t.title.replace(THE, ""));
    if (!tw.length) continue;
    for (let at = 0; at < qw.length; at++) {
      let k = 0;
      while (k < tw.length && at + k < qw.length && (qw[at + k] === tw[k] || (qw[at + k].length >= 4 && near(qw[at + k], tw[k])))) k++;
      let score = k >= tw.length || k >= 2 ? k : 0;
      if (!score && qw[at].length >= 3 && qw[at].length <= 7 && tw.length >= 3 && qw[at] === initials(t.title)) { k = 1; score = 1; } // "himym"
      if (!score) continue;
      const pop = t.popularity ?? 100;
      if (k === 1 && pop < 10) continue; // a one-word match only for a well-known title, not every obscure "The Restaurant"
      score = k * 1e6 + pop * (k >= tw.length ? 3 : 1); // more words first, then popularity (the whole title counts triple against the start of a longer one)
      if (!best || score > best.score) best = { t, k, at, score };
    }
  }
  return best ? { title: best.t, rest: qw.filter((_, i) => i < best!.at || i >= best!.at + best!.k).filter((w) => !FILLER.has(w)) } : null;
}

/** How a character is related to another ("sheldon mom"): the relative's TMDB gender and how their age compares. */
const REL: Record<string, { g: number; kind: "parent" | "child" | "sibling" | "spouse" | "grand" | "elder" }> = {
  mom: { g: 1, kind: "parent" }, mother: { g: 1, kind: "parent" }, mum: { g: 1, kind: "parent" }, mama: { g: 1, kind: "parent" },
  dad: { g: 2, kind: "parent" }, father: { g: 2, kind: "parent" }, papa: { g: 2, kind: "parent" },
  sister: { g: 1, kind: "sibling" }, brother: { g: 2, kind: "sibling" },
  wife: { g: 1, kind: "spouse" }, husband: { g: 2, kind: "spouse" },
  daughter: { g: 1, kind: "child" }, son: { g: 2, kind: "child" },
  grandma: { g: 1, kind: "grand" }, grandmother: { g: 1, kind: "grand" }, grandpa: { g: 2, kind: "grand" }, grandfather: { g: 2, kind: "grand" },
  aunt: { g: 1, kind: "elder" }, uncle: { g: 2, kind: "elder" },
};
export type Relation = (typeof REL)[string];
/** A relation word among the leftover words, and the words that name whose relative ("sheldon mom" -> mom of "sheldon"). Needs someone to be related to. */
export function findRelation(rest: readonly string[]): { rel: Relation; word: string; anchor: string[] } | null {
  const i = rest.findIndex((w) => REL[w]);
  return i < 0 || rest.length < 2 ? null : { rel: REL[rest[i]], word: rest[i], anchor: rest.filter((_, j) => j !== i) };
}

const AGE: Record<Relation["kind"], (anchor: number, other: number) => boolean> = {
  parent: (a, o) => o <= a - 12, child: (a, o) => o >= a + 12, sibling: (a, o) => Math.abs(o - a) <= 15, spouse: () => true, grand: (a, o) => o <= a - 30, elder: (a, o) => o <= a - 5,
};

export interface CastHit { id: number; name: string; photo: string | null; role: string; g?: number }
/**
 * Relatives of a character, from names alone (TMDB has no family tree): the character the typed words name ("sheldon" -> Sheldon Cooper), then the others who share
 * their surname with the right gender and a fitting age gap (the actors' birth years; unknown years are not held against anyone). "sheldon mom" -> Mary Cooper, not his sister.
 */
export function relatives(cast: readonly CastHit[], anchor: readonly string[], r: Relation, born: (id: number) => number | null): { of: CastHit; people: CastHit[] } | null {
  const of = cast.find((c) => { const rw = words(roleLabel(c.role)); return anchor.every((w) => rw.some((x) => near(w, x))); });
  if (!of) return null;
  const sur = words(roleLabel(of.role)).slice(-1)[0];
  if (!sur) return null;
  const a = born(of.id);
  const people = cast.filter((c) => c.id !== of.id && c.g === r.g && words(roleLabel(c.role)).includes(sur) && (() => { const o = born(c.id); return a == null || o == null || AGE[r.kind](a, o); })());
  return people.length ? { of, people } : null;
}

/** Episodes whose name has every leftover word (misspelt or a close word allowed: "asian" for "The Chinese Restaurant"). */
export function matchEpisodes<E extends { name: string }>(eps: readonly E[], rest: readonly string[], max = 6): E[] {
  if (!rest.length) return [];
  return eps.filter((e) => { const nw = words(e.name); return rest.every((w) => nw.some((x) => near(w, x) || (SAME[w] ?? []).includes(x))); }).slice(0, max);
}

/** Cast of one title whose character or name matches every leftover word (misspellings allowed); the characters first. */
export function matchCast(cast: readonly CastHit[], rest: readonly string[], max = 12): CastHit[] {
  if (!rest.length) return [];
  const rows: { c: CastHit; rank: number }[] = [];
  cast.forEach((c, i) => {
    const rw = words(roleLabel(c.role)), nw = words(c.name);
    const inR = (w: string) => rw.some((x) => near(w, x)), inN = (w: string) => nw.some((x) => near(w, x));
    if (!rest.every((w) => inR(w) || inN(w))) return;
    rows.push({ c, rank: (rest.every(inR) ? 0 : 1) * 1000 + i });
  });
  return rows.sort((a, b) => a.rank - b.rank).slice(0, max).map((r) => r.c);
}

/** `theme`: the title is about it (a TMDB keyword such as "lawyer" or "heist"), which says the title fits, not that this actor plays that part. */
export interface ActorMatch { credit: PCredit; role: string; by: "role" | "title" | "both" | "theme" | "all" }

/** The credits where every leftover word starts a word of the character or the title (or a close match for the character, see SAME). No leftover words: their best-known work. */
export function matchCredits(credits: readonly PCredit[], rest: readonly string[], themes: Readonly<Record<string, readonly string[]>> = {}, max = 24): ActorMatch[] {
  const rows: { m: ActorMatch; rank: number }[] = [];
  for (const c of credits) {
    const role = roleLabel(c.role);
    if (!rest.length) { if (!c.extra) rows.push({ rank: 0, m: { credit: c, role, by: "all" } }); continue; }
    const rw = words(role), tw = words(c.title);
    const inRole = (w: string) => rw.some((x) => near(w, x) || (SAME[w] ?? []).includes(x));
    const inTitle = (w: string) => tw.some((x) => near(w, x));
    const kw = (themes[c.key] ?? []).flatMap(words);
    const inTheme = (w: string) => kw.some((x) => near(w, x) || (SAME[w] ?? []).includes(x));
    if (!rest.every((w) => inRole(w) || inTitle(w) || inTheme(w))) continue;
    const allRole = rest.every(inRole), allTitle = rest.every(inTitle);
    const solid = rest.every((w) => inRole(w) || inTitle(w));
    rows.push({ rank: allRole ? 0 : allTitle ? 1 : solid ? 2 : 3, m: { credit: c, role, by: allRole ? "role" : allTitle ? "title" : solid ? "both" : "theme" } });
  }
  return rows.sort((a, b) => a.rank - b.rank || (a.m.credit.order ?? 99) - (b.m.credit.order ?? 99) || b.m.credit.votes - a.m.credit.votes).slice(0, max).map((r) => r.m);
}
