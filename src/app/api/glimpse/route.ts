import { NextResponse, type NextRequest } from "next/server";
import { searchImages } from "@/lib/image-search";

export type { GlimpseImage } from "@/lib/image-search";

/** Image search for the Glimpse panel (see `searchImages`). Not configured: the panel falls back to opening Google Images in a new tab. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return NextResponse.json({ configured: true, images: [] });
  const r = await searchImages(q);
  if (r.configured && r.error) return NextResponse.json(r, { status: 502 });
  return NextResponse.json({ configured: r.configured, images: r.images }, r.configured && "serper" in r ? { headers: { "Cache-Control": "private, max-age=86400" } } : undefined);
}
