import { unstable_cache } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

export interface GlimpseImage { thumb: string; full: string; page: string; title: string }

type SerperRes = { ok: true; images: GlimpseImage[] } | { ok: false; status: number; msg?: string };

/** One Serper call per distinct query per 30 days (Next's data cache, keyed by the query), so looking at the same title again costs nothing. */
const cachedSerper = unstable_cache(async (q: string, apiKey: string): Promise<SerperRes> => {
  const r = await fetch("https://google.serper.dev/images", { method: "POST", headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ q, num: 12 }) });
  if (!r.ok) return { ok: false, status: r.status, msg: (await r.text().catch(() => "")).slice(0, 120) };
  const j = await r.json() as { images?: { title?: string; imageUrl: string; thumbnailUrl?: string; link?: string }[] };
  return { ok: true, images: (j.images ?? []).slice(0, 12).map((i) => ({ thumb: i.thumbnailUrl ?? i.imageUrl, full: i.imageUrl, page: i.link ?? i.imageUrl, title: i.title ?? "" })) };
}, ["glimpse-serper"], { revalidate: 60 * 60 * 24 * 30 });

/**
 * Image search for the Glimpse panel. Uses Serper (SERPER_API_KEY, real Google Images results) when set, else Google's Programmable Search JSON API (image mode) when GOOGLE_CSE_KEY and
 * GOOGLE_CSE_CX are set; otherwise reports `configured: false` and the panel falls back to opening Google Images in a new tab
 * (google.com cannot be embedded in a page, and has no keyless API). The key stays on the server.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return NextResponse.json({ configured: true, images: [] });
  const serper = process.env.SERPER_API_KEY;
  if (serper) {
    try {
      // Serper returns real Google Images results. POST bodies are not cached by fetch, so cache by hand via a GET-shaped key below.
      const r = await cachedSerper(q, serper);
      if (!r.ok) { console.error(`[error] glimpse: Serper answered ${r.status}${r.msg ? `: ${r.msg}` : ""}`); return NextResponse.json({ configured: true, images: [], error: "Image search is unavailable right now." }, { status: 502 }); }
      return NextResponse.json({ configured: true, images: r.images }, { headers: { "Cache-Control": "private, max-age=86400" } });
    } catch (e) {
      console.error("[error] glimpse:", e);
      return NextResponse.json({ configured: true, images: [], error: "Image search is unavailable right now." }, { status: 502 });
    }
  }
  const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return NextResponse.json({ configured: false, images: [] });
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.search = new URLSearchParams({ key, cx, q, searchType: "image", num: "9", safe: "active" }).toString();
  try {
    const r = await fetch(u, { next: { revalidate: 86400 } });
    if (!r.ok) {
      const body = await r.json().catch(() => null) as { error?: { message?: string } } | null;
      console.error(`[error] glimpse: Google answered ${r.status}: ${body?.error?.message ?? ""}`);
      return NextResponse.json({ configured: true, images: [], error: "Image search is unavailable right now." }, { status: 502 });
    }
    const j = await r.json() as { items?: { link: string; title: string; image?: { thumbnailLink?: string; contextLink?: string } }[] };
    const images: GlimpseImage[] = (j.items ?? []).map((i) => ({ thumb: i.image?.thumbnailLink ?? i.link, full: i.link, page: i.image?.contextLink ?? i.link, title: i.title }));
    return NextResponse.json({ configured: true, images });
  } catch (e) {
    console.error("[error] glimpse:", e);
    return NextResponse.json({ configured: true, images: [], error: "Image search is unavailable right now." }, { status: 502 });
  }
}
