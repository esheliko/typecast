import { newEpDetail } from "./new-episode";
import { dayIn } from "./today";
import { airsLabel, daysUntil } from "./episodes";
import { caughtUp, continueHref, continueLabel } from "./watch-library";
import { cleanRuntime, stoppedShort } from "./film-resume";
import { nextOut } from "./place-strip";
import type { Item, LibItem } from "./types";

/**
 * Watch next: ranks what to watch next instead of listing everything you ever started.
 * Pure (no fetching), so it runs on the server with TMDB facts and also without them (the instant first paint).
 *
 * - In progress counts only while it is fresh: a series you touched last week leads, one untouched for months does not
 *   (Watching titles untouched for 6 weeks: at most one, as a "Still watching?" question; Partly watched is never a continue card).
 * - The watchlist is ranked by what makes something a good pick tonight: new episodes, streaming on your services,
 *   recommended by titles you loved, your favourite genres, how well it is rated, must-watch, recently added. Unreleased titles are left out.
 * - A few new titles from outside the library (recommended by what you loved) are mixed in, so it is a place to discover too.
 */

const DAY = 24 * 3600 * 1000;
export const FRESH_DAYS = 21;
export const STALE_DAYS = 60;
/** A Watching title untouched this long (6 weeks) is offered "Still watching?" (never moved automatically). */
export const STILL_WATCHING_DAYS = 42;
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
  /** Series: when the next episode airs, YYYY-MM-DD, if scheduled. Optional so older callers need not set it. */
  nextAir?: string | null;
  /** Series: season sizes (specials excluded) and the newest aired episode, from the same TMDB response. They make "Next: S3 E9" / "Caught up" true. */
  seasons?: { n: number; eps: number }[];
  lastEp?: { s: number; e: number } | null;
  /** Names of your streaming services it is on (subscription, free or with ads) in your country. */
  onMine: string[];
  /** Whether it can be streamed anywhere at all in your country. */
  streamable: boolean;
  recs: Rec[];
}

export type PickKind = "resume" | "continue" | "new-eps" | "library" | "stale" | "still" | "discover";
/** `tag` is the first of your services it streams on (null if none or not looked up); `checked` is whether TMDB was asked. */
export interface Pick extends Item { why: string; tag: string | null; length: string | null; kind: PickKind; score: number; checked: boolean; /** A watched series that came back because a new episode (or season) aired: shown as a badge. */ fresh?: "episode" | "season";
  /** A "continue" card: where /watching reopens at the episode to continue with (set only when there is one to continue with). */
  go?: string;
  /** A "resume" card (a Watching film with a stopped time): the minutes and the runtime, for the Resume sheet. */
  resume?: { min: number; of: number | null };
  /** The label of the `go` link ("Continue" when absent): a new card kind with its own action (a film "Resume") sets its own word and `go`, nothing else in the strip changes. */
  cta?: string }

/** Service ids that TMDB knows. Negative ids are labels the user typed in by hand, with no availability data. */
export const realServices = (ids: number[]) => ids.filter((id) => Number.isInteger(id) && id > 0);

/** "Tonight on your services": only picks you can stream right now on a service you have. */
export const onYourServices = (picks: Pick[]) => picks.filter((p) => p.tag !== null);

/** Which picks Watch next shows: both, only new titles from outside the library, or only what is already in the library. */
export type Source = "both" | "new" | "library";
export const SOURCES: [Source, string][] = [["both", "Both"], ["new", "New picks"], ["library", "My library"]];
export const bySource = (picks: Pick[], src: Source) => (src === "both" ? picks : picks.filter((p) => (p.kind === "discover") === (src === "new")));

export interface Ctx {
  now: number;
  facts: Map<string, Facts>;
  /** Whether the user picked streaming services (otherwise availability is neutral). */
  hasServices: boolean;
  /** The user's time zone (from their country), so "today" is their today. UTC when absent. */
  tz?: string;
}

const daysSince = (t: number, now: number) => (now - t) / DAY;
const iso = (t: number, tz?: string) => dayIn(t, tz);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthOf = (t: number, now: number) => { const d = new Date(t); return MONTHS[d.getUTCMonth()] + (new Date(now).getUTCFullYear() !== d.getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ""); };

/** "1h 52m" for a film, "45 min episodes" for a series. */
export function lengthLabel(type: Item["type"], runtime: number | null): string | null {
  if (!runtime || runtime <= 0) return null;
  if (type === "tv") return `${runtime} min episodes`;
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

/**
 * Should a Watching title be offered "Still watching?": Watching (never Partly), untouched for more than 6 weeks, and no new episode waiting
 * (neither the new-episode flag nor an aired episode newer than the last touch). Pure; `rankUpNext` keeps at most one such card.
 */
export function isStillWatching(l: { status: LibItem["status"]; newEp?: LibItem["newEp"]; updated: number }, now: number, newer = false): boolean {
  return l.status === "watching" && !l.newEp && !newer && daysSince(l.updated, now) > STILL_WATCHING_DAYS;
}

function inProgress(l: LibItem, ctx: Ctx): Pick | null {
  const f = ctx.facts.get(l.key);
  const age = daysSince(l.updated, ctx.now);
  const after = l.progress ? `after S${l.progress.s} E${l.progress.e}` : null;
  const base = { key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, length: lengthLabel(l.type, f?.runtime ?? null), tag: f?.onMine[0] ?? null, checked: !!f };
  // Came back from Watched because an episode aired: it leads, and says which one. Does not go stale while it waits.
  if (l.status === "watching" && l.newEp) {
    return { ...base, kind: "new-eps", score: 21, fresh: l.newEp.season ? "season" : "episode", why: `${newEpDetail(l.newEp, ctx.now)}${after ? ` · ${after}` : ""}` };
  }
  // A series with an episode newer than your last touch is worth picking back up even if it sat for a while.
  const newer = l.type === "tv" && !!f?.lastAired && f.lastAired > iso(l.updated, ctx.tz);
  const newEps = (): Pick => ({ ...base, kind: "new-eps", score: 12, why: after ? `New episodes · ${after}` : "New episodes since you last watched" });
  // Partly watched means stopped or seen a bit: never a "continue" card, only a "new episodes" one.
  if (l.status === "partial") return newer ? newEps() : null;
  if (isStillWatching(l, ctx.now, newer)) return { ...base, kind: "still", score: 0.5, why: `Still watching? Untouched since ${monthOf(l.updated, ctx.now)}` };
  if (age > FRESH_DAYS && newer) return newEps();
  // A Watching title that is fresh enough: the label says where to continue, and is always true.
  const seasons = l.type === "tv" ? f?.seasons : undefined;
  const lastEp = l.type === "tv" ? f?.lastEp : undefined;
  const up = l.type === "tv" && !!l.progress && !caughtUp(l.progress, seasons, lastEp);
  // "· new ep Thursday" when the next episode airs within a week.
  const soon = l.type === "tv" && f?.nextAir && daysUntil(f.nextAir, iso(ctx.now, ctx.tz)) <= 6 ? airsLabel(f.nextAir, iso(ctx.now, ctx.tz)) : "";
  // The next episode is out: "S3 E7 · out now" with its runtime ("47 min"), a Continue link that opens /watching there.
  const out = l.type === "tv" && l.status === "watching" ? nextOut(l.progress, seasons, lastEp) : null;
  const label = out ? `S${out.s} E${out.e} · out now` : continueLabel(l.progress, seasons, lastEp);
  return { ...base, kind: "continue", score: age <= FRESH_DAYS ? 20 - age / 7 : 9 - (age - FRESH_DAYS) / 10, why: soon && !out ? `${label} · new ep ${soon}` : label,
    ...(out && f?.runtime ? { length: `${f.runtime} min` } : {}),
    ...(up ? { go: continueHref(l, seasons) } : {}) };
}

/**
 * Film resume (docs/features/film-resume.md): a Watching film with a stopped time is a "Resume" card ("52:00 of 1h 48m · Resume"), ranked like a fresh
 * continue card. Null for anything else, and for a film untouched for 6 weeks (that stays a "Still watching?" question), so `inProgress` decides those.
 */
export function filmResume(l: LibItem, ctx: Ctx): Pick | null {
  if (l.type !== "movie" || l.status !== "watching" || !l.stoppedMin || l.stoppedMin < 1 || l.newEp) return null;
  const age = daysSince(l.updated, ctx.now);
  if (age > STILL_WATCHING_DAYS) return null;
  const f = ctx.facts.get(l.key);
  const of = cleanRuntime(l.stoppedOf ?? f?.runtime);
  return { key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, kind: "resume", length: null, tag: f?.onMine[0] ?? null, checked: !!f,
    score: age <= FRESH_DAYS ? 20.5 - age / 7 : 9 - (age - FRESH_DAYS) / 10, why: stoppedShort(l.stoppedMin, of), resume: { min: l.stoppedMin, of } };
}

function fromWatchlist(l: LibItem, ctx: Ctx, taste: Map<number, number>, recBy: Map<string, LibItem[]>): Pick | null {
  const f = ctx.facts.get(l.key);
  const today = iso(ctx.now, ctx.tz);
  if (f?.released && f.released > today) return null; // not out yet: not a next watch
  const base = { key: l.key, type: l.type, id: l.id, title: l.title, year: l.year, poster: l.poster, length: lengthLabel(l.type, f?.runtime ?? null), tag: f?.onMine[0] ?? null, checked: !!f };
  const reasons: [number, string][] = [];
  let score = 3;
  // A watched series moved back to the watchlist because a new episode aired (see recheckEpisodes).
  if (l.type === "tv" && l.watchedAt && f?.lastAired && f.lastAired > iso(l.watchedAt, ctx.tz)) { score += 5; reasons.push([5, "New episodes are out"]); }
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
function recPool(lib: LibItem[], seeds: LibItem[], facts: Map<string, Facts>, now: number, tz?: string): { r: Rec; from: LibItem[] }[] {
  const own = new Set(lib.map((l) => l.key));
  const today = iso(now, tz);
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
export function discoveryCandidates(lib: LibItem[], facts: Map<string, Facts>, now: number, max = 8, tz?: string): Rec[] {
  return recPool(lib, tasteSeeds(lib), facts, now, tz).sort((a, b) => b.from.length - a.from.length || b.r.vote - a.r.vote).slice(0, max).map((e) => e.r);
}

/** New titles from outside the library that loved titles agree on; ones on your services first. */
export function discoveries(lib: LibItem[], ctx: Ctx, seeds: LibItem[], taste: Map<number, number>, max = 4): Pick[] {
  return recPool(lib, seeds, ctx.facts, ctx.now, ctx.tz).map(({ r, from }) => {
    const f = ctx.facts.get(r.key);
    let score = from.length * 2 + voteBoost(r.vote, r.votes) + tasteOf(r.genres, taste);
    if (f?.onMine.length) score += 2; else if (ctx.hasServices) score -= 1.5;
    return { key: r.key, type: r.type, id: r.id, title: r.title, year: r.year, poster: r.poster, kind: "discover" as const, score,
      tag: f?.onMine[0] ?? null, checked: !!f, length: lengthLabel(r.type, f?.runtime ?? null), why: because(from) };
  }).sort((a, b) => b.score - a.score).slice(0, max);
}

/**
 * The strip, best first. `snoozed` titles ("Not now") are left out. In-progress titles lead while fresh; the watchlist
 * follows by score; discoveries are slotted in every few cards; at most one "Still watching?" title, near the end.
 */
export function rankUpNext(lib: LibItem[], ctx: Ctx, snoozed: Set<string> = new Set(), max = MAX_PICKS): Pick[] {
  const live = lib.filter((l) => !snoozed.has(l.key));
  const seeds = tasteSeeds(lib);
  const taste = genreTaste(seeds, ctx.facts);
  const recBy = recommenders(seeds, ctx.facts);
  const progress = live.filter((l) => l.status === "watching" || l.status === "partial").map((l) => ({ l, p: filmResume(l, ctx) ?? inProgress(l, ctx) })).filter((x): x is { l: LibItem; p: Pick } => !!x.p);
  // At most one "Still watching?" card (the most recently touched of them), near the end.
  const stale = progress.filter((x) => x.p.kind === "still").sort((a, b) => b.l.updated - a.l.updated).map((x) => x.p);
  // Every fresh Watching title leads (no cap of 4); Partly "new episodes" cards follow them. Only the whole strip is capped.
  const active = progress.filter((x) => x.p.kind !== "still").sort((a, b) => Number(b.l.status === "watching") - Number(a.l.status === "watching") || b.p.score - a.p.score).map((x) => x.p);
  const wl = live.filter((l) => l.status === "watchlist").map((l) => fromWatchlist(l, ctx, taste, recBy)).filter((p): p is Pick => !!p).sort((a, b) => b.score - a.score);
  const disc = discoveries(lib, ctx, seeds, taste, 8).filter((p) => !snoozed.has(p.key));

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
