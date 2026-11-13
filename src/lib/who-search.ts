import { continuePlace, normalizePlace } from "./watch-library";
import { roleLabel } from "./roster";
import type { Pos, WhoFace } from "./who-types";

/** Pure logic for the "Who's that?" mode of Search: find someone in a title's cast, up to a place, by a name or role you remember. Unit tested in tests/unit/who-search.test.ts. */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

/** A piece of text and whether it is what the typed words matched. */
export interface Part { t: string; hit: boolean }

/** Splits `text` so every word that STARTS with a typed word is marked ("Nell Forester" + "for" -> Nell, **For**ester). Accents and case are ignored; the text is kept as it is. */
export function highlight(text: string, q: string): Part[] {
  const qw = words(q);
  if (!qw.length || !text) return [{ t: text, hit: false }];
  const out: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = norm(m[0]);
    const n = qw.find((x) => w.startsWith(x));
    if (!n) continue;
    const len = Math.min(m[0].length, Math.max(1, n.length));
    const start = m.index!;
    if (start > last) out.push({ t: text.slice(last, start), hit: false });
    out.push({ t: text.slice(start, start + len), hit: true });
    last = start + len;
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false });
  return out.length ? out : [{ t: text, hit: false }];
}

export interface WhoMatch { face: WhoFace; role: string; name: Part[]; roleParts: Part[]; by: "name" | "role" | "both" }

const PART_ORDER: Record<WhoFace["part"], number> = { episode: 0, main: 1, guest: 2, earlier: 3 };

/**
 * Everyone in `faces` (already scoped to the place by the server) whose name or character matches: every typed word must start a word of the name or of the role.
 * Ranked: all words in the name, then all in the role, then split across both; then who is in this episode, the main cast, the rest; then most episodes. Fewer than 2 letters matches nothing.
 */
export function matchWho(faces: readonly WhoFace[], q: string, max = 30): WhoMatch[] {
  const qw = words(q);
  if (!qw.length || norm(q).length < 2) return [];
  const rows: { m: WhoMatch; rank: number }[] = [];
  for (const f of faces) {
    const role = roleLabel(f.role);
    const nw = words(f.name), rw = words(role);
    const inName = (w: string) => nw.some((x) => x.startsWith(w)), inRole = (w: string) => rw.some((x) => x.startsWith(w));
    if (!qw.every((w) => inName(w) || inRole(w))) continue;
    const allName = qw.every(inName), allRole = qw.every(inRole);
    const by = allName ? "name" : allRole ? "role" : "both";
    rows.push({ rank: allName ? 0 : allRole ? 1 : 2, m: { face: f, role, name: highlight(f.name, q), roleParts: highlight(role, q), by } });
  }
  return rows.sort((a, b) => a.rank - b.rank || PART_ORDER[a.m.face.part] - PART_ORDER[b.m.face.part] || b.m.face.n - a.m.face.n || a.m.face.name.localeCompare(b.m.face.name)).slice(0, max).map((r) => r.m);
}

/** "3 episodes" for someone who guested; "Main cast" for a regular (their totals say little); nothing when unknown. */
export function appearsLabel(f: WhoFace): string {
  if (f.part === "main") return "Main cast";
  if (f.n < 1) return "";
  return `${f.n} episode${f.n === 1 ? "" : "s"}`;
}

/**
 * Where "Who's that?" starts for a title. A series that is Watching with a saved place starts at the episode after it (the one you are about to watch, same as the Watching now page);
 * anything else starts on the whole series. `seasons` (when known) rolls past the end of a season. Films have no place.
 */
export function startPos(type: "movie" | "tv", status: string | undefined, progress: { s: number; e: number } | null | undefined, seasons?: readonly { n: number; eps: number }[]): Pos | null {
  if (type !== "tv") return null;
  const p = status === "watching" ? continuePlace(progress, seasons) : null;
  if (!p) return { s: null, e: null };
  const n = seasons ? normalizePlace(p, seasons, true) : p;
  return { s: n.s, e: n.e };
}
