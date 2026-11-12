import { unstable_cache } from "next/cache";

export interface GlimpseImage { thumb: string; full: string; page: string; title: string; w?: number; h?: number }

type SerperRes = { ok: true; images: GlimpseImage[] } | { ok: false; status: number; msg?: string };
export type ImageSearch = { configured: false; images: [] } | { configured: true; images: GlimpseImage[]; error?: string; serper?: boolean };

/** A failed answer is thrown, not returned: a returned value is cached, and one bad minute at Serper would then hide that query's images for a month. */
class SerperError extends Error { constructor(public status: number, msg: string) { super(msg); } }
/** One Serper call per distinct query per 30 days (Next's data cache, keyed by the query), so looking at the same title again costs nothing. */
const cachedSerper = unstable_cache(async (q: string): Promise<SerperRes> => {
  const apiKey = process.env.SERPER_API_KEY ?? "";
  const r = await fetch("https://google.serper.dev/images", { method: "POST", headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ q, num: 12 }) });
  if (!r.ok) throw new SerperError(r.status, (await r.text().catch(() => "")).slice(0, 120));
  const j = await r.json() as { images?: { title?: string; imageUrl: string; imageWidth?: number; imageHeight?: number; thumbnailUrl?: string; link?: string }[] };
  return { ok: true, images: (j.images ?? []).slice(0, 12).map((i) => ({ thumb: i.thumbnailUrl ?? i.imageUrl, full: i.imageUrl, page: i.link ?? i.imageUrl, title: i.title ?? "", w: i.imageWidth, h: i.imageHeight })) };
}, ["glimpse-serper"], { revalidate: 60 * 60 * 24 * 30 });

/**
 * Image search for the Glimpse panel and the Then photos. Uses Serper (SERPER_API_KEY, real Google Images results) when set, else Google's Programmable Search JSON API (image mode)
 * when GOOGLE_CSE_KEY and GOOGLE_CSE_CX are set; otherwise `configured: false`. Failures come back as `error` (the keys stay on the server).
 */
export async function searchImages(q: string): Promise<ImageSearch> {
  if (process.env.SERPER_API_KEY) {
    try {
      const r = await cachedSerper(q).catch((e): SerperRes => { if (e instanceof SerperError) return { ok: false, status: e.status, msg: e.message }; throw e; });
      if (!r.ok) { console.error(`[error] glimpse: Serper answered ${r.status}${r.msg ? `: ${r.msg}` : ""}`); return { configured: true, images: [], error: "Image search is unavailable right now." }; }
      return { configured: true, images: r.images, serper: true };
    } catch (e) {
      console.error("[error] glimpse:", e);
      return { configured: true, images: [], error: "Image search is unavailable right now." };
    }
  }
  const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return { configured: false, images: [] };
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.search = new URLSearchParams({ key, cx, q, searchType: "image", num: "9", safe: "active" }).toString();
  try {
    const r = await fetch(u, { next: { revalidate: 86400 } });
    if (!r.ok) {
      const body = await r.json().catch(() => null) as { error?: { message?: string } } | null;
      console.error(`[error] glimpse: Google answered ${r.status}: ${body?.error?.message ?? ""}`);
      return { configured: true, images: [], error: "Image search is unavailable right now." };
    }
    const j = await r.json() as { items?: { link: string; title: string; image?: { thumbnailLink?: string; contextLink?: string; width?: number; height?: number } }[] };
    return { configured: true, images: (j.items ?? []).map((i) => ({ thumb: i.image?.thumbnailLink ?? i.link, full: i.link, page: i.image?.contextLink ?? i.link, title: i.title, w: i.image?.width, h: i.image?.height })) };
  } catch (e) {
    console.error("[error] glimpse:", e);
    return { configured: true, images: [], error: "Image search is unavailable right now." };
  }
}
