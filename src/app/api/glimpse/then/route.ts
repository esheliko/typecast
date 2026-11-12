import { NextResponse, type NextRequest } from "next/server";
import { chooseThen } from "@/lib/then-server";

export const maxDuration = 30;

/** The Then photo for one cast face: `q` is the role search, `now` the TMDB profile path (so Then is never the same picture), the rest ranks the results. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return NextResponse.json({ configured: true, url: null });
  const now = p.get("now") ?? "";
  const profile = /^\/[\w.-]{4,80}$/.test(now) ? now : null;
  const num = (k: string) => { const n = Number(p.get(k)); return Number.isInteger(n) && n > 0 && n < 100000 ? n : 0; };
  const [tv, sn, ep] = [num("tv"), num("s"), num("e")];
  const exact = tv && sn && ep ? { tv, s: sn, e: ep, imdb: /^tt\d{6,10}$/.test(p.get("imdb") ?? "") ? p.get("imdb")! : null } : null;
  try {
    const r = await chooseThen(q, profile, { actor: p.get("actor")?.slice(0, 100) ?? "", char: p.get("char")?.slice(0, 100) || undefined, title: p.get("title")?.slice(0, 120) || undefined }, exact);
    return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("[error] glimpse/then:", e);
    return NextResponse.json({ configured: true, url: null, error: "Image search is unavailable right now." }, { status: 502 });
  }
}
