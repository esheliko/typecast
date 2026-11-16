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
  villain: ["killer", "mobster", "gangster", "boss"],
};

/** From a typed query and the people TMDB found for its first words: the person whose full name starts the query (longest wins) and the words left over. */
export function splitActorQuery<P extends { name: string }>(q: string, people: readonly P[]): { person: P; rest: string[] } | null {
  const qw = words(q);
  let best: { person: P; n: number } | null = null;
  for (const p of people) {
    const nw = words(p.name);
    if (!nw.length || nw.length > qw.length || !nw.every((w, i) => qw[i] === w)) continue;
    if (!best || nw.length > best.n) best = { person: p, n: nw.length };
  }
  if (!best) return null;
  return { person: best.person, rest: qw.slice(best.n).filter((w) => !FILLER.has(w)) };
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
    const inRole = (w: string) => rw.some((x) => x.startsWith(w) || (SAME[w] ?? []).includes(x));
    const inTitle = (w: string) => tw.some((x) => x.startsWith(w));
    const kw = (themes[c.key] ?? []).flatMap(words);
    const inTheme = (w: string) => kw.some((x) => x === w || x.startsWith(w) || (SAME[w] ?? []).includes(x));
    if (!rest.every((w) => inRole(w) || inTitle(w) || inTheme(w))) continue;
    const allRole = rest.every(inRole), allTitle = rest.every(inTitle);
    const solid = rest.every((w) => inRole(w) || inTitle(w));
    rows.push({ rank: allRole ? 0 : allTitle ? 1 : solid ? 2 : 3, m: { credit: c, role, by: allRole ? "role" : allTitle ? "title" : solid ? "both" : "theme" } });
  }
  return rows.sort((a, b) => a.rank - b.rank || (a.m.credit.order ?? 99) - (b.m.credit.order ?? 99) || b.m.credit.votes - a.m.credit.votes).slice(0, max).map((r) => r.m);
}
