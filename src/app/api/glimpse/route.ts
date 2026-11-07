import { NextResponse, type NextRequest } from "next/server";

export interface GlimpseImage { thumb: string; full: string; page: string; title: string }

/**
 * Image search for the Glimpse panel. Uses Google's Programmable Search JSON API (image mode) when GOOGLE_CSE_KEY and
 * GOOGLE_CSE_CX are set; otherwise reports `configured: false` and the panel falls back to opening Google Images in a new tab
 * (google.com cannot be embedded in a page, and has no keyless API). The key stays on the server.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return NextResponse.json({ configured: true, images: [] });
  const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return NextResponse.json({ configured: false, images: [] });
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.search = new URLSearchParams({ key, cx, q, searchType: "image", num: "9", safe: "active" }).toString();
  try {
    const r = await fetch(u, { next: { revalidate: 86400 } });
    if (!r.ok) {
      const body = await r.json().catch(() => null) as { error?: { message?: string } } | null;
      return NextResponse.json({ configured: true, images: [], error: body?.error?.message ?? `Google answered ${r.status}` }, { status: 502 });
    }
    const j = await r.json() as { items?: { link: string; title: string; image?: { thumbnailLink?: string; contextLink?: string } }[] };
    const images: GlimpseImage[] = (j.items ?? []).map((i) => ({ thumb: i.image?.thumbnailLink ?? i.link, full: i.link, page: i.image?.contextLink ?? i.link, title: i.title }));
    return NextResponse.json({ configured: true, images });
  } catch (e) {
    return NextResponse.json({ configured: true, images: [], error: (e as Error).message }, { status: 502 });
  }
}
