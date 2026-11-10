import type { AggPerson, Gender, Pos, ScopeKind, SeasonData, SeasonPerson, WhoFace, WhoPart } from "./who-types";

/**
 * "Who's that?" (the /who page): who can be on screen at a position, and how to filter and find them. Pure; unit tested in tests/unit/who-scope.test.ts.
 *
 * The spoiler rule lives here: a person is in the roster only if TMDB says they appeared inside the scope.
 *   exact season + episode: seasons before it (season credits), and the current season's guest stars up to that episode plus its regular cast
 *   season only:            every season up to and including it ("includes all of season S because the episode is not set")
 *   nothing set:            the whole series (a note says later seasons may be included)
 * Season 0 (specials) stands alone: only the specials up to that episode.
 */

export function scopeKind(pos: Pos | null): ScopeKind | null {
  if (!pos) return null;
  if (pos.s == null) return "all";
  return pos.e == null ? "season" : "exact";
}

/** Is an episode inside the scope of this position? */
export function inScope(s: number, e: number, pos: Pos | null): boolean {
  const k = scopeKind(pos);
  if (!pos || k === "all") return true;
  if (pos.s === 0) return s === 0 && (k === "season" || e <= (pos.e ?? 0));
  if (s <= 0) return false;
  if (s < pos.s!) return true;
  return s === pos.s && (k === "season" || e <= (pos.e ?? 0));
}

/** The words that explain a wider-than-exact scope, or null when the position is exact. */
export function scopeNote(pos: Pos | null): string | null {
  const k = scopeKind(pos);
  if (k === "season") return pos!.s === 0 ? "Specials are listed on their own: everyone in them is included." : `Includes all of season ${pos!.s} because the episode is not set.`;
  if (k === "all") return "The season is not set, so the whole series is included. People from later seasons may appear.";
  return null;
}

/** "S2 E8", "S2", "Specials E3", or "Season not set". */
export function posLabel(pos: Pos | null): string {
  if (!pos) return "";
  if (pos.s == null) return "Season not set";
  const s = pos.s === 0 ? "Specials" : `S${pos.s}`;
  return pos.e == null ? s : `${s} E${pos.e}`;
}

/** "S2E8", "S2", "Specials E3" or "" (not set): the short way to say where you are. */
export function posCode(pos: Pos | null): string {
  if (!pos || pos.s == null) return "";
  if (pos.s === 0) return pos.e == null ? "Specials" : `Specials E${pos.e}`;
  return pos.e == null ? `S${pos.s}` : `S${pos.s}E${pos.e}`;
}

/** The two forms of a title key: "tv:79744" (everywhere in the app) and "tv-79744" (in the URL). */
export function parseUrlKey(v: string | null | undefined): { type: "movie" | "tv"; id: number } | null {
  const m = /^(movie|tv)[-:](\d{1,9})$/.exec(v ?? "");
  return m ? { type: m[1] as "movie" | "tv", id: Number(m[2]) } : null;
}
export const urlKey = (key: string) => key.replace(":", "-");

const num = (v: string | null | undefined): number | null => { const n = Number(v); return v != null && v !== "" && Number.isInteger(n) && n >= 0 && n < 1000 ? n : null; };
/** `?s=2&e=8` -> a position. An episode without a season means nothing, so it is dropped. */
export function posFromParams(s: string | null | undefined, e: string | null | undefined): Pos {
  const ss = num(s);
  return { s: ss, e: ss == null ? null : num(e) };
}

const gender = (g: unknown): Gender => (g === 1 || g === 2 || g === 3 ? g : 0);
export const asGender = gender;

interface Acc {
  id: number; name: string; photo: string | null; g: Gender; roles: string[]; n: number; ls: number; le: number; cids: string[];
  main: boolean; inEp: boolean; order: number;
}
const LATE = 999;

function bump(acc: Map<number, Acc>, p: SeasonPerson, order: number): Acc {
  let a = acc.get(p.id);
  if (!a) { a = { id: p.id, name: p.name, photo: p.photo, g: p.g, roles: [], n: 0, ls: 0, le: 0, cids: [], main: false, inEp: false, order }; acc.set(p.id, a); }
  if (!a.photo && p.photo) a.photo = p.photo;
  return a;
}
/** "Nell Forester" and "Nell Forester (voice)" are one part. */
const roleKey = (r: string) => r.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
function addRole(a: Acc, role: string) {
  for (const r of role.split(" / ").map((x) => x.trim()).filter(Boolean)) if (!a.roles.some((x) => roleKey(x) === roleKey(r)) && a.roles.length < 6) a.roles.push(r);
}
function later(a: Acc, s: number, e: number) { if (s > a.ls || (s === a.ls && e > a.le)) { a.ls = s; a.le = e; } }
function addCids(a: Acc, cids: string[]) { for (const c of cids) if (c && !a.cids.includes(c) && a.cids.length < 12) a.cids.push(c); }

const roleText = (a: Acc) => a.roles.slice(0, 2).join(" / ") + (a.roles.length > 2 ? ` +${a.roles.length - 2}` : "");

function finish(acc: Map<number, Acc>, part: (a: Acc) => WhoPart): WhoFace[] {
  const faces = [...acc.values()].map((a): WhoFace & { _o: number } => ({
    id: a.id, name: a.name, photo: a.photo, g: a.g, role: roleText(a), part: part(a), n: a.n, ls: a.ls, le: a.le, cids: a.cids, _o: a.order,
  }));
  const rank: Record<WhoPart, number> = { episode: 0, main: 1, earlier: 2, guest: 2 };
  faces.sort((x, y) => rank[x.part] - rank[y.part]
    || (x.part === "main" ? x._o - y._o : (y.n - x.n) || (y.ls - x.ls) || (y.le - x.le) || x._o - y._o));
  return faces.map((f) => { const { _o, ...rest } = f; void _o; return rest; });
}

/**
 * Everyone who can be on screen at a position that names a season (an exact episode, or the whole season).
 * `seasons` holds the data of every season up to and including `pos.s` (season 0 for the specials); missing ones are skipped.
 */
export function buildRoster(seasons: SeasonData[], pos: Pos): WhoFace[] {
  const k = scopeKind(pos);
  if (k !== "exact" && k !== "season") return [];
  const acc = new Map<number, Acc>();
  let order = 0;
  const current = seasons.find((x) => x.n === pos.s);
  // The current season's regulars first, so they head the Main cast in billing order.
  for (const p of current?.regulars ?? []) { const a = bump(acc, p, order++); a.main = true; addRole(a, p.role); }
  for (const sd of [...seasons].sort((x, y) => x.n - y.n)) {
    if (sd.n === 0 ? pos.s !== 0 : sd.n > pos.s!) continue;
    const exactHere = k === "exact" && sd.n === pos.s;
    if (!exactHere) {
      // Season credits: everyone credited in that season, with their episode totals there.
      for (const p of sd.agg) {
        const a = bump(acc, p, order++);
        a.n += p.total; later(a, sd.n, LATE); addRole(a, p.role); addCids(a, p.cids);
      }
      continue;
    }
    // The current season at an exact episode: only guests of episodes up to and including it (never a later episode).
    for (const ep of [...sd.episodes].sort((x, y) => x.e - y.e)) {
      if (ep.e > pos.e!) continue;
      for (const g of ep.guests) {
        const a = bump(acc, g, order++);
        a.n += 1; later(a, sd.n, ep.e); addRole(a, g.role); addCids(a, g.cid ? [g.cid] : []);
        if (ep.e === pos.e) a.inEp = true;
      }
    }
  }
  return finish(acc, (a) => (k === "exact"
    ? (a.main ? "main" : a.inEp ? "episode" : "earlier")
    : (a.main ? "main" : "guest")));
}

/** Everyone credited in the series, for a position with no season set. `order` is TMDB's billing order. */
export function buildAllRoster(people: (AggPerson & { order: number })[]): WhoFace[] {
  const max = Math.max(0, ...people.map((p) => p.total));
  const acc = new Map<number, Acc>();
  const mains = new Set<number>();
  for (const p of people) {
    const a = bump(acc, p, p.order);
    a.n = p.total; addRole(a, p.role); addCids(a, p.cids);
    if (p.order < 10 || (max > 0 && p.total >= max * 0.5)) mains.add(p.id);
  }
  return finish(acc, (a) => (mains.has(a.id) ? "main" : "guest"));
}

/* ---------- groups, filters, finder ---------- */

export interface WhoGroup { id: WhoPart; label: string; faces: WhoFace[] }

const LABELS: Record<WhoPart, string> = { episode: "In this episode", main: "Main cast", earlier: "Seen earlier", guest: "Guests" };

/** The sections shown, in order, skipping empty ones. A film is one "Cast" group per billing (main then the rest is the same list). */
export function groupWhoFaces(faces: WhoFace[], kind: ScopeKind | null): WhoGroup[] {
  const order: WhoPart[] = kind === "exact" ? ["episode", "main", "earlier"] : ["main", "guest"];
  return order.map((id): WhoGroup => ({ id, label: LABELS[id], faces: faces.filter((f) => f.part === id) })).filter((g) => g.faces.length);
}

export type GenderFilter = "all" | "f" | "m";
/** All keeps everyone. Women / Men use TMDB's gender; people with none recorded (or non-binary) stay under All only. */
export function byGender(faces: WhoFace[], f: GenderFilter): WhoFace[] {
  if (f === "all") return faces;
  const want = f === "f" ? 1 : 2;
  return faces.filter((x) => x.g === want);
}
export const guestsOnly = (faces: WhoFace[]) => faces.filter((f) => f.part !== "main");
export const mainCastOnly = (faces: WhoFace[]) => faces.filter((f) => f.part === "main");
export type CastFilter = "all" | "main" | "guests";
/** All / Main cast / Guests (everyone who is not main cast). */
export const byCast = (faces: WhoFace[], f: CastFilter): WhoFace[] => (f === "main" ? mainCastOnly(faces) : f === "guests" ? guestsOnly(faces) : faces);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

/**
 * The finder: every typed word must start some word of the actor's name, the character name or the role
 * ("nell", "forester", "voice"). Name matches rank first. Searches everyone passed in, not only what is shown.
 */
export function matchFaces(faces: WhoFace[], q: string): WhoFace[] {
  const qw = words(q);
  if (!qw.length) return faces;
  const hits: { f: WhoFace; rank: number; i: number }[] = [];
  faces.forEach((f, i) => {
    const nw = words(f.name), rw = words(f.role);
    const inName = qw.every((w) => nw.some((x) => x.startsWith(w)));
    if (inName) { hits.push({ f, rank: 0, i }); return; }
    if (qw.every((w) => nw.some((x) => x.startsWith(w)) || rw.some((x) => x.startsWith(w)))) hits.push({ f, rank: 1, i });
  });
  return hits.sort((a, b) => a.rank - b.rank || a.i - b.i).map((h) => h.f);
}

/** "x6 episodes" for the tile; nothing for the main cast (their totals say little). */
export function episodesLabel(f: WhoFace): string {
  if (f.part === "main" || f.n < 1) return "";
  return `x${f.n} episode${f.n === 1 ? "" : "s"}`;
}
