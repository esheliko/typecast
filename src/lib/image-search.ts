import { unstable_cache } from "next/cache";
import { freeImages } from "./free-images";
import { deadForMs, liveKeys, serperKeys, shapeOpenWeb, type GlimpseImage, type ImageHint } from "./image-sources";

export type { GlimpseImage, ImageHint } from "./image-sources";

type SerperRes = { ok: true; images: GlimpseImage[] } | { ok: false; status: number; msg?: string };
export type ImageSearch = { configured: false; images: [] } | { configured: true; images: GlimpseImage[]; error?: string; source?: "serper" | "openweb" | "free" };

/** A failed answer is thrown, not returned: a returned value is cached, and one bad minute at Serper would then hide that query's images for a month. */
class SerperError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** Keys Serper refused (out of credits, rejected, too fast) and when each may be tried again. Per server instance: a cold start just tries them once more. */
const benched = new Map<string, number>();

/** One Serper call per distinct query per 30 days (Next's data cache, keyed by the query), so looking at the same title again costs nothing, even once every key is out of credits. */
const cachedSerper = unstable_cache(async (q: string): Promise<SerperRes> => {
  let last = new SerperError(0, "no Serper key is usable right now");
  for (const apiKey of liveKeys(serperKeys(process.env), benched, Date.now())) {
    const r = await fetch("https://google.serper.dev/images", { method: "POST", headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ q, num: 12 }) });
    if (r.ok) {
      const j = await r.json() as { images?: { title?: string; imageUrl: string; imageWidth?: number; imageHeight?: number; thumbnailUrl?: string; link?: string }[] };
      return { ok: true, images: (j.images ?? []).slice(0, 12).map((i) => ({ thumb: i.thumbnailUrl ?? i.imageUrl, full: i.imageUrl, page: i.link ?? i.imageUrl, title: i.title ?? "", w: i.imageWidth, h: i.imageHeight })) };
    }
    last = new SerperError(r.status, (await r.text().catch(() => "")).slice(0, 120));
    const off = deadForMs(r.status);
    if (!off) break; // not the key's fault (Serper down): another key would not help
    benched.set(apiKey, Date.now() + off);
  }
  throw last;
}, ["glimpse-serper"], { revalidate: 60 * 60 * 24 * 30 });

/** One OpenWeb Ninja call per distinct query per 30 days. An empty answer is thrown too, so it is not cached. */
const cachedOpenWeb = unstable_cache(async (q: string): Promise<GlimpseImage[]> => {
  const key = process.env.OPENWEBNINJA_API_KEY;
  if (!key) throw new Error("OPENWEBNINJA_API_KEY is not set");
  const r = await fetch(`https://api.openwebninja.com/realtime-image-search/search?${new URLSearchParams({ query: q })}`, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`OpenWeb Ninja answered ${r.status}`);
  const images = shapeOpenWeb(await r.json());
  if (!images.length) throw new Error("OpenWeb Ninja had no images");
  return images;
}, ["glimpse-openweb"], { revalidate: 60 * 60 * 24 * 30 });

/**
 * Image search for the Glimpse panel and the Then photos. Serper (SERPER_API_KEY, optionally SERPER_API_KEY_2; real Google Images results) first while a key has credits;
 * then OpenWeb Ninja (OPENWEBNINJA_API_KEY; not for the Then photo); otherwise, or when those have nothing, the free uncapped sources (`freeImages`: TMDB by `hint`, Wikimedia Commons by name). The keys stay on the server;
 * `error` is set only when no source could answer. `configured: false` is kept for callers that still handle it, but is no longer returned.
 */
export async function searchImages(q: string, hint: ImageHint = {}): Promise<ImageSearch> {
  if (serperKeys(process.env).length) {
    try {
      const r = await cachedSerper(q).catch((e): SerperRes => { if (e instanceof SerperError) return { ok: false, status: e.status, msg: e.message }; throw e; });
      if (r.ok && r.images.length) return { configured: true, images: r.images, source: "serper" };
      if (!r.ok && r.status !== 0) console.error(`[error] glimpse: Serper answered ${r.status}${r.msg ? `: ${r.msg}` : ""}; using the free sources`);
    } catch (e) {
      console.error("[error] glimpse:", e);
    }
  }
  // OpenWeb Ninja (OPENWEBNINJA_API_KEY) second. Not for the Then photo (`role`): its results are press photos, and Then must be a scene.
  if (process.env.OPENWEBNINJA_API_KEY && !hint.role) {
    try {
      return { configured: true, images: await cachedOpenWeb(q), source: "openweb" };
    } catch (e) {
      console.error("[error] glimpse: OpenWeb Ninja:", e);
    }
  }
  try {
    return { configured: true, images: await freeImages(q, hint), source: "free" };
  } catch (e) {
    console.error("[error] glimpse:", e);
    return { configured: true, images: [], error: "Image search is unavailable right now." };
  }
}
