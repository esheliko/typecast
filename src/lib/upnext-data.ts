import { getPickBasics } from "./tmdb";
import { tzOf } from "./today";
import { discoveryCandidates, rankUpNext, realServices, tasteSeeds, type Facts, type Pick } from "./upnext";
import type { Item, LibItem, Profile } from "./types";

const MAX_WATCHLIST = 45;
const MAX_PROGRESS = 30;

/** Runs `fn` over `xs`, `n` at a time. */
async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]); } }));
  return out;
}

async function factsFor(items: Item[], profile: Profile, into: Map<string, Facts>) {
  const mine = new Set(realServices(profile.services));
  const todo = items.filter((it, i) => !into.has(it.key) && items.findIndex((x) => x.key === it.key) === i);
  const got = await pool(todo, 12, (it) => getPickBasics(it.type, it.id).catch(() => null));
  todo.forEach((it, i) => {
    const b = got[i];
    if (!b) return;
    const here = b.prov[profile.country] ?? [];
    const onMine = [...new Set(here.filter((id) => mine.has(id)).map((id) => b.names.get(id) ?? profile.serviceNames[String(id)] ?? "your services"))];
    into.set(it.key, { genres: b.genres, vote: b.vote, votes: b.votes, runtime: b.runtime, released: b.released, lastAired: b.lastAired, nextAir: b.nextAir, seasons: b.seasons, lastEp: b.lastEp, onMine, streamable: here.length > 0, recs: b.recs });
  });
}

/**
 * Watch next with TMDB facts: looks up the in-progress titles, the watchlist (must-watch and the most recently added first)
 * and the loved titles that steer taste, then the best outside recommendations for availability. Returns more picks than
 * the strip shows so titles snoozed on this device can drop out without leaving it short.
 */
export async function loadUpNext(lib: LibItem[], profile: Profile, now = Date.now()): Promise<Pick[]> {
  const progress = lib.filter((l) => l.status === "watching" || l.status === "partial").sort((a, b) => Number(b.status === "watching") - Number(a.status === "watching") || b.updated - a.updated).slice(0, MAX_PROGRESS);
  const wl = lib.filter((l) => l.status === "watchlist").sort((a, b) => Number(b.priority === "must") - Number(a.priority === "must") || b.added - a.added).slice(0, MAX_WATCHLIST);
  const facts = new Map<string, Facts>();
  await factsFor([...tasteSeeds(lib), ...progress, ...wl], profile, facts);
  await factsFor(discoveryCandidates(lib, facts, now, 8, tzOf(profile.country)), profile, facts);
  // Titles not looked up (a very long watchlist) are still ranked, just on what the library knows.
  // 48 so the "on your services" view still has enough after filtering.
  return rankUpNext(lib, { now, facts, tz: tzOf(profile.country), hasServices: realServices(profile.services).length > 0 }, new Set(), 48);
}
