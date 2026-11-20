import { tmdb } from "./tmdb";
import { cleanQuery, parseKey, shapeCommons, shapeProfiles, shapeTagged, shapeTitleImages, wantsPoster, type GlimpseImage, type ImageHint } from "./image-sources";

/**
 * Free, uncapped image sources, used when Serper is not set or is out of credits: TMDB by id (portraits, role stills, posters, backdrops; the token is already
 * there) and Wikimedia Commons by name (no key). Each source that fails is skipped; it throws only when every source asked failed.
 * Cached by fetch (TMDB 24 h, Commons 30 days).
 */
const DAY = 86400;

async function commons(q: string): Promise<GlimpseImage[]> {
  const words = cleanQuery(q);
  if (words.length < 3) return [];
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", generator: "search", gsrsearch: `${words} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "12", prop: "imageinfo", iiprop: "url|size|mime", iiurlwidth: "400", format: "json" }).toString();
  const r = await fetch(u, { headers: { "User-Agent": "Typecast/1.0 (image search fallback)", Accept: "application/json" }, signal: AbortSignal.timeout(6000), next: { revalidate: 30 * DAY } });
  if (!r.ok) throw new Error(`Commons answered ${r.status}`);
  return shapeCommons(await r.json());
}

export async function freeImages(q: string, hint: ImageHint = {}): Promise<GlimpseImage[]> {
  const title = parseKey(hint.key);
  let failed = 0, asked = 0;
  const soft = async <T>(p: Promise<T>): Promise<T | null> => { asked++; try { return await p; } catch (e) { failed++; console.error("[error] free images:", e); return null; } };

  if (hint.pid) {
    const name = cleanQuery(q);
    const [profiles, tagged] = await Promise.all([
      hint.role ? null : soft(tmdb(`/person/${hint.pid}/images`, {}, DAY)),
      soft(tmdb(`/person/${hint.pid}/tagged_images`, {}, DAY)),
    ]);
    const stills = shapeTagged(tagged, title?.id, !hint.role);
    const faces = shapeProfiles(profiles, name);
    // The Photos tab is about the person (portraits first); a role tab or the Then photo is about the role (stills from the title first).
    const list = hint.role ? stills : title ? [...stills, ...faces] : [...faces, ...stills];
    if (list.length >= 3 || hint.role) {
      if (!list.length && failed === asked) throw new Error("TMDB images unavailable");
      return list.slice(0, 12);
    }
    const more = await soft(commons(q));
    if (!list.length && !more?.length && failed === asked) throw new Error("free image sources unavailable");
    return [...list, ...(more ?? [])].slice(0, 12);
  }

  if (title) {
    const j = await soft(tmdb(`/${title.type}/${title.id}/images`, { language: "en", include_image_language: "en,null" }, DAY));
    const list = shapeTitleImages(j, wantsPoster(q), cleanQuery(q), `https://www.themoviedb.org/${title.type}/${title.id}`);
    if (list.length || failed < asked) return list;
    throw new Error("TMDB images unavailable");
  }

  const list = await soft(commons(q));
  if (list === null) throw new Error("Commons unavailable");
  return list;
}
