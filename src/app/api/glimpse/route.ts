import { NextResponse, type NextRequest } from "next/server";
import { searchImages } from "@/lib/image-search";
import { parseKey } from "@/lib/image-sources";

export type { GlimpseImage } from "@/lib/image-search";

/** Image search for the Glimpse panel (see `searchImages`). `p` (TMDB person id) and `k` ("tv:123") let the free sources look it up by id. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return NextResponse.json({ configured: true, images: [] });
  const pid = Number(req.nextUrl.searchParams.get("p"));
  const r = await searchImages(q, { pid: Number.isInteger(pid) && pid > 0 && pid < 100_000_000 ? pid : undefined, key: parseKey(req.nextUrl.searchParams.get("k")) ? req.nextUrl.searchParams.get("k")! : undefined });
  if (r.configured && r.error) return NextResponse.json(r, { status: 502 });
  return NextResponse.json({ configured: r.configured, images: r.images }, r.configured && r.images.length ? { headers: { "Cache-Control": "private, max-age=86400" } } : undefined);
}
