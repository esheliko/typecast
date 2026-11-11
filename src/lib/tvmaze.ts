/**
 * A second source for episode guest stars. TMDB's per-episode guest lists often miss people (Daniel Lissing is absent from The Rookie
 * S3E7); TVmaze (free, no key, CC BY-SA) usually has them. The show is found by IMDb id, its episode list gives each episode's id, and
 * `/episodes/<id>/guestcast` gives the guests. Server only; every failure is "nothing extra" so the page falls back to TMDB alone.
 */
const UA = { "user-agent": "Typecast/1.0 (personal film and TV tracker)", accept: "application/json" };
const BASE = "https://api.tvmaze.com";
const DAY = 86400;

export interface ExtraGuest { name: string; role: string }

/** Lowercase, accent-free, letters and digits only: "Zoë  Saldaña" and "zoe saldana" match. */
export const normName = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** TVmaze guests TMDB does not already list for the episode (by normalised name), each name once. Pure. */
export function missingGuests(known: Iterable<string>, tvmaze: ExtraGuest[]): ExtraGuest[] {
  const have = new Set([...known].map(normName));
  const out: ExtraGuest[] = [];
  for (const g of tvmaze) {
    const k = normName(g.name);
    if (!k || have.has(k)) continue;
    have.add(k); out.push(g);
  }
  return out;
}

/** The TVmaze guestcast payload as our `ExtraGuest` list (people with no name or a "Self" role of nothing are skipped). Pure. */
export function parseGuestcast(rows: unknown): ExtraGuest[] {
  if (!Array.isArray(rows)) return [];
  const out: ExtraGuest[] = [];
  for (const r of rows as { person?: { name?: string }; character?: { name?: string } }[]) {
    const name = r?.person?.name?.trim();
    if (name) out.push({ name, role: (r?.character?.name ?? "").trim() });
  }
  return out;
}

async function get(path: string, revalidate: number): Promise<unknown> {
  const r = await fetch(`${BASE}${path}`, { headers: UA, signal: AbortSignal.timeout(6000), next: { revalidate } } as RequestInit);
  if (!r.ok) throw new Error(`TVmaze answered ${r.status}`);
  return r.json();
}

/** TVmaze's episode ids for a show found by IMDb id: `"<season>x<episode>" -> id`. Empty when unknown or unreachable. */
export async function tvmazeEpisodeIds(imdb: string | null): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (!imdb || !/^tt\d+$/.test(imdb)) return ids;
  try {
    const show = (await get(`/lookup/shows?imdb=${imdb}`, 30 * DAY)) as { id?: number };
    if (!show?.id) return ids;
    const eps = (await get(`/shows/${show.id}/episodes?specials=1`, DAY)) as { id: number; season: number; number: number | null }[];
    for (const e of eps) if (e.number != null) ids.set(`${e.season}x${e.number}`, e.id);
  } catch { /* nothing extra */ }
  return ids;
}

/** One episode's guests according to TVmaze. */
export async function tvmazeGuests(episodeId: number): Promise<ExtraGuest[]> {
  try { return parseGuestcast(await get(`/episodes/${episodeId}/guestcast`, 6 * 3600)); } catch { return []; }
}
