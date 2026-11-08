import type { Item, LibItem } from "./types";

/**
 * Watch next: ranks what to watch next instead of listing everything you ever started.
 * Pure (no fetching), so it runs on the server with TMDB facts and also without them (the instant first paint).
 *
 * - In progress counts only while it is fresh: a series you touched last week leads, one untouched for months does not
 *   (at most one stale title is shown, as a "still want to finish?" question).
 * - The watchlist is ranked by what makes something a good pick tonight: new episodes, streaming on your services,
 *   recommended by titles you loved, your favourite genres, how well it is rated, must-watch, recently added. Unreleased titles are left out.
 * - A few new titles from outside the library (recommended by what you loved) are mixed in, so it is a place to discover too.
 */

const DAY = 24 * 3600 * 1000;
export const FRESH_DAYS = 21;
export const STALE_DAYS = 60;
export const MAX_PICKS = 16;

/** A title recommended by one of your loved titles, from TMDB. */
export interface Rec extends Item { vote: number; votes: number; genres: number[]; released: string }

/** What TMDB knows about a title that matters for picking it. */
export interface Facts {
  genres: number[]; vote: number; votes: number; runtime: number | null;
  /** Release (film) or first air date (series), YYYY-MM-DD, or "". */
  released: string;
  /** Series: the newest episode already aired, YYYY-MM-DD. */
  lastAired: string | null;
  /** Names of your streaming services it is on (subscription, free or with ads) in your country. */
  onMine: string[];
  /** Whether it can be streamed anywhere at all in your country. */
  streamable: boolean;
  recs: Rec[];
}

export type PickKind = "continue" | "new-eps" | "library" | "stale" | "discover";
/** `tag` is the first of your services it streams on (null if none or not looked up); `checked` is whether TMDB was asked. */
export interface Pick extends Item { why: string; tag: string | null; length: string | null; kind: PickKind; score: number; checked: boolean }

/** Service ids that TMDB knows. Negative ids are labels the user typed in by hand, with no availability data. */
export const realServices = (ids: number[]) => ids.filter((id) => Number.isInteger(id) && id > 0);

/** "Tonight on your services": only picks you can stream right now on a service you have. */
export const onYourServices = (picks: Pick[]) => picks.filter((p) => p.tag !== null);

export interface Ctx {
  now: number;
  facts: Map<string, Facts>;
  /** Whether the user picked streaming services (otherwise availability is neutral). */
  hasServices: boolean;
}

const daysSince = (t: number, now: number) => (now - t) / DAY;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthOf = (t: number, now: number) => { const d = new Date(t); return MONTHS[d.getUTCMonth()] + (new Date(now).getUTCFullYear() !== d.getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ""); };

/** "1h 52m" for a film, "45m eps" for a series. */
export function lengthLabel(type: Item["type"], runtime: number | null): string | null {
  if (!runtime || runtime <= 0) return null;
  if (type === "tv") return `${runtime}m eps`;
  const h = Math.floor(runtime / 60), m = runtime % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** The titles that say most about taste: rated 4+ (or watched and unrated, weaker), most recent first. */
export function tasteSeeds(lib: LibItem[], max = 12): LibItem[] {
  const w = (l: LibItem) => (l.status === "watched" || l.status === "watching" ? (l.rating >= 4 ? 3 : l.rating === 0 ? 1 : 0) : 0);
  return lib.filter((l) => w(l) > 0).sort((a, b) => w(b) - w(a) || (b.watchedAt ?? b.updated) - (a.watchedAt ?? a.updated)).slice(0, max);
}

/** Genre id -> share of taste (0..1, the favourite genre is 1). */
export function genreTaste(seeds: LibItem[], facts: Map<string, Facts>): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of seeds) for (const g of facts.get(s.key)?.genres ?? []) m.set(g, (m.get(g) ?? 0) + (s.rating >= 4 ? 2 : 1));
  const top = Math.max(0, ...m.values());
  if (top) for (const [g, v] of m) m.set(g, v / top);
  return m;
}

/** Which taste titles recommend each title (key -> those titles). */
export function recommenders(seeds: LibItem[], facts: Map<string, Facts>): Map<string, LibItem[]> {
  const m = new Map<string, LibItem[]>();
  for (const s of seeds) for (const r of facts.get(s.key)?.recs ?? []) m.set(r.key, [...(m.get(r.key) ?? []), s]);
  return m;
}

const tasteOf = (genres: number[], taste: Map<number, number>) => {
  if (!genres.length || !taste.size) return 0;
  const v = genres.map((g) => taste.get(g) ?? 0).sort((a, b) => b - a);
  return (v[0] ?? 0) * 0.7 + (v[1] ?? 0) * 0.3;
};
const voteBoost = (vote: number, votes: number) => (votes < 30 ? 0 : Math.max(-1.5, Math.min(2, (vote - 6.6) * 0.9)));
/** "Because you loved X and Y", or "watched" when they are not rated 4+ (you may not have loved them). */
export function because(from: LibItem[]): string {
  const two = [...from].sort((a, b) => b.rating - a.rating).slice(0, 2);
  return `Because you ${two.every((l) => l.rating >= 4) ? "loved" : "watched"} ${two.map((l) => l.title).join(" and ")}`;
}

function inProgress(l: LibItem, ctx: Ctx): Pick {
  const f = ctx.facts.get(l.key);
  const age = daysSince(l.updated, ctx.now);
  const where = l.progress ? `S${l.progress.s} E${l.progress.e}` : null;
  const base = { key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, length: lengthLabel(l.type, f?.runtime ?? null), tag: f?.onMine[0] ?? null, checked: !!f };
  // A series with an episode newer than your last touch is worth picking back up even if it sat for a while.
  const newer = l.type === "tv" && !!f?.lastAired && f.lastAired > iso(l.updated);
  if (age <= FRESH_DAYS) return { ...base, kind: "continue", score: 20 - age / 7, why: where ? `Continue from ${where}` : l.status === "watching" ? "You're watching this" : "Pick up where you left off" };
  if (newer) return { ...base, kind: "new-eps", score: 12, why: where ? `New episodes · you're at ${where}` : "New episodes since you last watched" };
  if (age <= STALE_DAYS) return { ...base, kind: "continue", score: 9 - (age - FRESH_DAYS) / 10, why: where ? `Pick up at ${where}` : "Still on it?" };
  return { ...base, kind: "stale", score: 0.5, why: `Untouched since ${monthOf(l.updated, ctx.now)} · still want to finish?` };
}

function fromWatchlist(l: LibItem, ctx: Ctx, taste: Map<number, number>, recBy: Map<string, LibItem[]>): Pick | null {
  const f = ctx.facts.get(l.key);
  const today = iso(ctx.now);
  if (f?.released && f.released > today) return null; // not out yet: not a next watch
  const base = { key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, length: lengthLabel(l.type, f?.runtime ?? null), tag: f?.onMine[0] ?? null, checked: !!f };
  const reasons: [number, string][] = [];
  let score = 3;
  // A watched series moved back to the watchlist because a new episode aired (see recheckEpisodes).
  if (l.type === "tv" && l.watchedAt && f?.lastAired && f.lastAired > iso(l.watchedAt)) { score += 5; reasons.push([5, "New episodes are out"]); }
  if (l.priority === "must") { score += 3; reasons.push([3, "On your must-watch list"]); }
  if (f) {
    if (f.onMine.length) { score += 2.5; reasons.push([0.05, `Streaming on ${f.onMine[0]}`]); } // already a badge on the poster: only a last-resort reason
    else if (ctx.hasServices) score -= f.streamable ? 0.8 : 1.5;
    const recs = recBy.get(l.key) ?? [];
    if (recs.length) { const b = Math.min(3, recs.length * 1.5); score += b; reasons.push([b + 0.1, because(recs)]); }
    const t = tasteOf(f.genres, taste) * 2;
    score += t;
    const v = voteBoost(f.vote, f.votes);
    score += v;
    if (v >= 1.2) reasons.push([v, `Rated ${f.vote.toFixed(1)} on TMDB`]);
    if (f.released && daysSince(Date.parse(f.released), ctx.now) <= 90) { score += 0.8; reasons.push([0.8, l.type === "tv" ? "New series" : "Just released"]); }
  }
  const age = daysSince(l.added, ctx.now);
  if (age <= 30) { score += 1; reasons.push([0.9, "Added recently"]); }
  else if (age > 365 && l.priority !== "must") score -= 0.6;
  reasons.sort((a, b) => b[0] - a[0]);
  return { ...base, kind: "library", score, why: reasons[0]?.[1] ?? "On your watchlist" };
}

/** Recommendations of loved titles that are not in the library, out already and well rated, with who recommends them. */
function recPool(lib: LibItem[], seeds: LibItem[], facts: Map<string, Facts>, now: number): { r: Rec; from: LibItem[] }[] {
  const own = new Set(lib.map((l) => l.key));
  const today = iso(now);
  const by = new Map<string, { r: Rec; from: LibItem[] }>();
  for (const s of seeds) for (const r of facts.get(s.key)?.recs ?? []) {
    if (own.has(r.key) || !r.poster || !r.released || r.released > today || r.votes < 100 || r.vote < 6.8) continue;
    const e = by.get(r.key) ?? { r, from: [] };
    if (!e.from.includes(s)) e.from.push(s);
    by.set(r.key, e);
  }
  return [...by.values()];
}

/** Candidates from outside the library worth looking up (for availability and length) before ranking. */
export function discoveryCandidates(lib: LibItem[], facts: Map<string, Facts>, now: number, max = 8): Rec[] {
  return recPool(lib, tasteSeeds(lib), facts, now).sort((a, b) => b.from.length - a.from.length || b.r.vote - a.r.vote).slice(0, max).map((e) => e.r);
}

/** New titles from outside the library that loved titles agree on; ones on your services first. */
export function discoveries(lib: LibItem[], ctx: Ctx, seeds: LibItem[], taste: Map<number, number>, max = 4): Pick[] {
  return recPool(lib, seeds, ctx.facts, ctx.now).map(({ r, from }) => {
    const f = ctx.facts.get(r.key);
    let score = from.length * 2 + voteBoost(r.vote, r.votes) + tasteOf(r.genres, taste);
    if (f?.onMine.length) score += 2; else if (ctx.hasServices) score -= 1.5;
    return { key: r.key, type: r.type, id: r.id, title: r.title, year: r.year, poster: r.poster, kind: "discover" as const, score,
      tag: f?.onMine[0] ?? null, checked: !!f, length: lengthLabel(r.type, f?.runtime ?? null), why: because(from) };
  }).sort((a, b) => b.score - a.score).slice(0, max);
}

/**
 * The strip, best first. `snoozed` titles ("Not now") are left out. In-progress titles lead while fresh; the watchlist
 * follows by score; discoveries are slotted in every few cards; at most one stale in-progress title, near the end.
 */
export function rankUpNext(lib: LibItem[], ctx: Ctx, snoozed: Set<string> = new Set(), max = MAX_PICKS): Pick[] {
  const live = lib.filter((l) => !snoozed.has(l.key));
  const seeds = tasteSeeds(lib);
  const taste = genreTaste(seeds, ctx.facts);
  const recBy = recommenders(seeds, ctx.facts);
  const progress = live.filter((l) => l.status === "watching" || l.status === "partial").map((l) => inProgress(l, ctx));
  const stale = progress.filter((p) => p.kind === "stale").sort((a, b) => b.score - a.score);
  const active = progress.filter((p) => p.kind !== "stale").sort((a, b) => b.score - a.score).slice(0, 4);
  const wl = live.filter((l) => l.status === "watchlist").map((l) => fromWatchlist(l, ctx, taste, recBy)).filter((p): p is Pick => !!p).sort((a, b) => b.score - a.score);
  const disc = discoveries(lib, ctx, seeds, taste).filter((p) => !snoozed.has(p.key));

  // In-progress first (they are what you are in the middle of), then the watchlist with a discovery every fourth card.
  const out: Pick[] = [...active];
  let d = 0;
  for (const p of wl) {
    if (out.length >= max) break;
    if (d < disc.length && (out.length - active.length) % 4 === 3) out.push(disc[d++]);
    out.push(p);
  }
  while (d < disc.length && out.length < max) out.push(disc[d++]);
  if (stale.length) out.splice(Math.min(out.length, Math.max(active.length + 3, out.length - 2)), 0, stale[0]);
  return out.slice(0, max);
}
