import { img } from "./img";

/** One picture in the Glimpse panel / Then search. Pure shaping helpers for the free image sources (TMDB, Wikimedia Commons) and Serper key rotation; unit tested in tests/unit/image-sources.test.ts. */
export interface GlimpseImage { thumb: string; full: string; page: string; title: string; w?: number; h?: number }

/** What the caller knows about the thing searched for, so a free source can look it up by id instead of by words. */
export interface ImageHint {
  /** TMDB person id. */
  pid?: number;
  /** "tv:79744" / "movie:603". Alone: a title (posters, scenes). With `pid`: that person's pictures from this title come first. */
  key?: string;
  /** The Then photo: stills from the person's roles only, never headshots. */
  role?: boolean;
}

const MAX = 12;

export const parseKey = (k: string | null | undefined): { type: "tv" | "movie"; id: number } | null => {
  const m = /^(tv|movie):(\d{1,9})$/.exec(k ?? "");
  return m ? { type: m[1] as "tv" | "movie", id: Number(m[2]) } : null;
};

type TmdbPic = { file_path?: string; width?: number; height?: number; vote_average?: number; vote_count?: number };
type Tagged = TmdbPic & { image_type?: string; media_type?: string; media?: { id?: number; name?: string; title?: string } };

const uniq = (list: GlimpseImage[]): GlimpseImage[] => {
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.full) ? false : (seen.add(i.full), true)));
};
const best = (a: TmdbPic, b: TmdbPic) => (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.vote_count ?? 0) - (a.vote_count ?? 0);

/** `/person/{id}/images`: the person's portraits, best voted first. */
export function shapeProfiles(j: { profiles?: TmdbPic[] } | null | undefined, name: string): GlimpseImage[] {
  return uniq((j?.profiles ?? []).filter((p) => p.file_path).sort(best).map((p) => ({ thumb: img(p.file_path, "w342"), full: img(p.file_path, "h632"), page: "https://www.themoviedb.org", title: name, w: p.width, h: p.height }))).slice(0, MAX);
}

/**
 * `/person/{id}/tagged_images`: stills and backdrops the person is tagged in, each carrying the title it comes from (so the Then ranking can tell the role).
 * `titleId`: pictures from that title first. Stills and backdrops come before posters (most people are tagged mostly on posters); `posters: false` (the Then photo,
 * which must be a scene) drops the posters. Headshots are never wanted here.
 */
export function shapeTagged(j: { results?: Tagged[] } | null | undefined, titleId?: number, posters = true): GlimpseImage[] {
  const rows = (j?.results ?? []).filter((r) => r.file_path && (r.image_type === "still" || r.image_type === "backdrop" || (posters && r.image_type === "poster")));
  const mine = (r: Tagged) => (titleId && r.media?.id === titleId ? 0 : 1);
  const scene = (r: Tagged) => (r.image_type === "poster" ? 1 : 0);
  return uniq(rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => scene(a.r) - scene(b.r) || mine(a.r) - mine(b.r) || best(a.r, b.r) || a.i - b.i)
    .map(({ r }) => ({ thumb: img(r.file_path, "w500"), full: img(r.file_path, "w1280"), page: r.media?.id && r.media_type ? `https://www.themoviedb.org/${r.media_type}/${r.media.id}` : "https://www.themoviedb.org", title: r.media?.name ?? r.media?.title ?? "", w: r.width, h: r.height }))).slice(0, MAX);
}

/** `/{tv|movie}/{id}/images`: posters (the Poster tab) or backdrops (Scenes), best voted first. */
export function shapeTitleImages(j: { posters?: TmdbPic[]; backdrops?: TmdbPic[] } | null | undefined, posters: boolean, title: string, link: string): GlimpseImage[] {
  const list = (posters ? j?.posters : j?.backdrops) ?? [];
  return uniq(list.filter((p) => p.file_path).sort(best).map((p) => ({ thumb: img(p.file_path, posters ? "w342" : "w500"), full: img(p.file_path, posters ? "w780" : "w1280"), page: link, title, w: p.width, h: p.height }))).slice(0, MAX);
}

/** The Poster tab asks for "<title> <year> film poster" and Scenes for "... scene" (titleSpec in glimpse.ts). */
export const wantsPoster = (q: string): boolean => /\bposter\s*$/i.test(q);

/** The words to look for on Commons: the search text without the role words the tabs append ("Bryan Cranston actor" -> "Bryan Cranston"). */
export function cleanQuery(q: string): string {
  return q.replace(/\b(tv series|film|scene|poster|actor|actress|director|writer|producer|composer)\b/gi, " ").replace(/\s+/g, " ").trim();
}

type CommonsPage = { title?: string; index?: number; imageinfo?: { url?: string; thumburl?: string; descriptionurl?: string; width?: number; height?: number; mime?: string }[] };
/** Wikimedia Commons `generator=search` answer. Photos only (JPEG/PNG), in the search's own order; the file name is the caption. */
export function shapeCommons(j: { query?: { pages?: Record<string, CommonsPage> } } | null | undefined): GlimpseImage[] {
  const pages = Object.values(j?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: GlimpseImage[] = [];
  for (const p of pages) {
    const i = p.imageinfo?.[0];
    if (!i?.url || !/^image\/(jpeg|png)$/.test(i.mime ?? "")) continue;
    out.push({ thumb: i.thumburl ?? i.url, full: i.url, page: i.descriptionurl ?? i.url, title: (p.title ?? "").replace(/^File:/i, "").replace(/\.\w{3,4}$/, "").replace(/_/g, " "), w: i.width, h: i.height });
  }
  return uniq(out).slice(0, MAX);
}

/* ---- Serper keys: more than one key is used in turn; a key that is out of credits (or rejected) is left alone for a while ---- */

/** Keys from SERPER_API_KEY and SERPER_API_KEY_2 (either may also hold several, comma-separated). No duplicates. */
export function serperKeys(env: Record<string, string | undefined>): string[] {
  const all = [env.SERPER_API_KEY, env.SERPER_API_KEY_2].flatMap((v) => (v ?? "").split(",")).map((k) => k.trim()).filter(Boolean);
  return [...new Set(all)];
}

/** How long to leave a key alone after Serper answered `status`: 0 = not the key's fault (try again as usual). Out of credits is 400/402, a bad key 401/403, too fast 429. */
export function deadForMs(status: number): number {
  if (status === 429) return 60_000;
  if (status === 400 || status === 401 || status === 402 || status === 403) return 6 * 3600_000;
  return 0;
}

/** The keys not currently benched, in order. `dead` maps a key to the time (ms) it may be tried again. */
export const liveKeys = (keys: string[], dead: ReadonlyMap<string, number>, now: number): string[] => keys.filter((k) => (dead.get(k) ?? 0) <= now);

/** OpenWeb Ninja `realtime-image-search/search` answer: Google-style image results. `thumbnail_url` is the small copy; `source_url` is the page the picture came from. */
type OwImage = { url?: string; thumbnail_url?: string; title?: string; width?: number; height?: number; source_url?: string; source_domain?: string };
export function shapeOpenWeb(j: { data?: OwImage[] } | null | undefined): GlimpseImage[] {
  const rows = (Array.isArray(j?.data) ? j.data : []).filter((r) => r.url && /^https?:\/\//.test(r.url));
  return uniq(rows.map((r) => ({ thumb: r.thumbnail_url ?? r.url!, full: r.url!, page: r.source_url ?? r.url!, title: r.title ?? "", w: r.width, h: r.height }))).slice(0, MAX);
}
