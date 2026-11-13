import type { Provider, ProviderGroup } from "./types";

/**
 * What we can honestly say about where a title streams for one country.
 * TMDB's provider data (JustWatch) has gaps: some countries have no entry at all for a title
 * (e.g. Disney+ in Israel), which is NOT the same as "not available there".
 *
 * - `here`: a flatrate/free/ads service is listed in the user's country.
 * - `paid`: the country is listed, but only rent/buy offers.
 * - `elsewhere`: nothing usable for the country, but it streams somewhere else; we say so and that we don't know about the country.
 * - `unknown`: no streaming service listed anywhere.
 */
export type WhereVerdict =
  | { kind: "here"; stream: Provider[] }
  | { kind: "paid"; rent: boolean; buy: boolean }
  | { kind: "elsewhere"; services: Provider[]; countries: string[]; listed: boolean }
  | { kind: "unknown" };

/** Streaming offers of one country, one entry per service. */
export function streamOf(g?: ProviderGroup): Provider[] {
  const all = [...(g?.flatrate ?? []), ...(g?.free ?? []), ...(g?.ads ?? [])];
  return all.filter((x, i) => all.findIndex((y) => y.id === x.id) === i);
}

/** At most `max` services that stream this title in other countries, the most widespread first. */
export function whereVerdict(prov: Record<string, ProviderGroup>, cc: string, max = 3): WhereVerdict {
  const mine = prov[cc];
  const here = streamOf(mine);
  if (here.length) return { kind: "here", stream: here };
  const hasPaid = !!(mine?.rent?.length || mine?.buy?.length);
  if (hasPaid) return { kind: "paid", rent: !!mine?.rent?.length, buy: !!mine?.buy?.length };

  const byService = new Map<number, { p: Provider; n: number }>();
  const countries: string[] = [];
  for (const [code, g] of Object.entries(prov)) {
    if (code === cc) continue;
    const s = streamOf(g);
    if (!s.length) continue;
    countries.push(code);
    for (const p of s) {
      const cur = byService.get(p.id);
      if (cur) cur.n += 1; else byService.set(p.id, { p, n: 1 });
    }
  }
  if (!countries.length) return { kind: "unknown" };
  const services = [...byService.values()].sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name)).slice(0, max).map((x) => x.p);
  // `listed`: the country had an entry but with nothing in it (rare), versus no entry at all.
  return { kind: "elsewhere", services, countries: countries.sort(), listed: !!mine };
}
