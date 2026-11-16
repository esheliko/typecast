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
  for (const n of [2, 3, 1]) for (let i = 0; i + n <= qw.length; i++) { const w = qw.slice(i, i + n); if (n === 1 && (w[0].length < 4 || FILLER.has(w[0]))) continue; out.push(w.join(" ")); }
  return [...new Set(out)];
}

/** The person whose full name appears anywhere in the query, allowing small misspellings (longest, then closest, wins), and the words left over. "wizard daniel radcliff" -> Daniel Radcliffe + "wizard". */
export function splitActorQuery<P extends { name: string }>(q: string, people: readonly P[]): { person: P; rest: string[] } | null {
  const qw = words(q);
  let best: { person: P; n: number; d: number; at: number } | null = null;
  for (const p of people) {
    const nw = words(p.name);
    if (!nw.length || nw.length > qw.length) continue;
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
/** The title whose name starts the query ("hunger games haymitch" -> The Hunger Games + "haymitch"), allowing small misspellings. Longest title wins, then the first in `titles` (TMDB's best). */
export function splitTitleQuery<T extends { title: string }>(q: string, titles: readonly T[]): { title: T; rest: string[] } | null {
  const qw = words(q);
  let best: { t: T; n: number } | null = null;
  for (const t of titles) {
    const tw = words(t.title.replace(THE, ""));
    if (!tw.length || tw.length > qw.length) continue;
    if (!tw.every((w, i) => qw[i] === w || (qw[i].length >= 5 && lev(qw[i], w) <= 1))) continue;
    if (!best || tw.length > best.n) best = { t, n: tw.length };
  }
  return best ? { title: best.t, rest: qw.slice(best.n).filter((w) => !FILLER.has(w)) } : null;
}

export interface CastHit { id: number; name: string; photo: string | null; role: string }
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
