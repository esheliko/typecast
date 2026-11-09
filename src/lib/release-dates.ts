/**
 * Country-specific film release dates from TMDB's `release_dates` (type 1 premiere, 2 limited theatrical, 3 theatrical, 4 digital,
 * 5 physical, 6 TV). Pure: no fetching. Premieres (festivals) are ignored; theatrical wins, then digital, then physical/TV.
 */
export interface RawRelease { type: number; release_date: string }
export interface RawCountry { iso_3166_1: string; release_dates: RawRelease[] }

const TIERS: number[][] = [[2, 3], [4], [5, 6]];
const DAY = /^\d{4}-\d{2}-\d{2}/;

/** The date to use for one country: earliest theatrical, else earliest digital, else earliest physical/TV. "" when none. */
export function pickRelease(rs: RawRelease[] | undefined | null): string {
  const ok = (rs ?? []).filter((r) => DAY.test(r?.release_date ?? "")).map((r) => ({ type: r.type, day: r.release_date.slice(0, 10) }));
  for (const tier of TIERS) {
    const days = ok.filter((r) => tier.includes(r.type)).map((r) => r.day).sort();
    if (days.length) return days[0];
  }
  return "";
}

/** One date per country code ("GB" -> "2026-12-17"); countries with nothing usable are left out. */
export function releaseByCountry(results: RawCountry[] | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of results ?? []) {
    const d = pickRelease(c?.release_dates);
    if (c?.iso_3166_1 && d) out[c.iso_3166_1] = d;
  }
  return out;
}

/** The user's country date when TMDB has one, else the primary release date. */
export function releaseFor(by: Record<string, string> | undefined | null, country: string, primary: string): string {
  return by?.[country?.toUpperCase()] || primary || "";
}
