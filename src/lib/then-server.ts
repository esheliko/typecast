import sharp from "sharp";
import { dHash, pickThenUrl, rankThenImages, type ThenWho } from "./then-photo";
import { img } from "./img";
import { searchImages } from "./image-search";
import { getFandomEpisodeGallery } from "./fandom";
import { galleryFor } from "./wiki-cast";
import { tmdb } from "./tmdb";

const cache = new Map<string, Promise<string | null>>();

/** Difference hash of the picture at `url`, read on the server (no CORS limits). null when it cannot be fetched or decoded in time. */
async function hashOf(url: string): Promise<string | null> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      try {
        if (!/^https:\/\//i.test(url)) return null;
        const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: "image/*" } });
        if (!r.ok || !/^image\//i.test(r.headers.get("content-type") ?? "")) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 3_000_000) return null;
        const px = await sharp(buf, { failOn: "none" }).resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
        return px.length >= 72 ? dHash(Array.from(px.subarray(0, 72))) : null;
      } catch { return null; }
    })();
    cache.set(url, p);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/**
 * The "Then" photo for one face: from the role search, the best-ranked picture that looks like the role (not a headshot) and is not the Now (profile) photo,
 * compared by address and by look, with the pixels read here. A candidate that cannot be read is skipped, so Now and Then are never the same picture.
 */
export interface ThenEp { tv: number; imdb: string | null; s: number; e: number }

/** The still of this actor from the show's Fandom gallery page for the episode being watched ("Actor as Character" captions), when the wiki has one. */
async function galleryThen(ep: ThenEp, profilePath: string | null, who: ThenWho): Promise<string | null> {
  try {
    const season = await tmdb(`/tv/${ep.tv}/season/${ep.s}`, {}, 6 * 3600);
    const name = String(((season.episodes ?? []) as { episode_number: number; name?: string }[]).find((x) => x.episode_number === ep.e)?.name ?? "");
    const pics = galleryFor(await getFandomEpisodeGallery(ep.imdb, who.title ?? "", ep.s, name), who.actor, who.char);
    return await pickThenUrl(pics.map((p) => p.url), profilePath ? img(profilePath, "w185") : null, hashOf, 3, false);
  } catch { return null; }
}

export async function chooseThen(q: string, profilePath: string | null, who: ThenWho, ep?: ThenEp | null): Promise<{ configured: boolean; url: string | null }> {
  // The episode's own gallery first: a still captioned with this actor in this very episode (the web search can only guess, and returned the show's key art for many faces).
  if (ep) { const g = await galleryThen(ep, profilePath, who); if (g) return { configured: true, url: g }; }
  const r = await searchImages(q);
  if (!r.configured) return { configured: false, url: null };
  if (r.error) throw new Error(r.error);
  const ranked = rankThenImages(r.images.map((i) => ({ thumb: i.thumb, page: i.page, title: i.title, w: i.w, h: i.h })), who);
  const url = await pickThenUrl(ranked.map((i) => i.thumb), profilePath ? img(profilePath, "w185") : null, hashOf, 6, true);
  return { configured: true, url };
}
