import { NextResponse, type NextRequest } from "next/server";
import { answer } from "@/lib/answer";
import { getLibrary, getProfile } from "@/lib/library";
import { apiError } from "@/lib/errors";
import { parseWatch, WATCH_COOKIE, type Watch } from "@/lib/watching";
import { parseUrlKey } from "@/lib/who-scope";

export const maxDuration = 60;

const current = (req: NextRequest) => parseWatch(req.cookies.get(WATCH_COOKIE)?.value);
const fail = (e: unknown) => { const { body, status } = apiError(e, "api/ask"); return NextResponse.json(body, { status }); };
const lib = () => getLibrary().catch(() => []);

/** POST { q, spoilers }: a fact about the title (story so far, filming, trivia, time left, …) from TMDB, Wikidata and Wikipedia. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { q?: unknown; spoilers?: unknown; k?: unknown; s?: unknown; e?: unknown } | null;
  let w = current(req);
  // The /who page names its own title and position ({k: "tv-79744", s, e}), so it works with no watch started and when the position is not an exact episode.
  const k = typeof body?.k === "string" ? parseUrlKey(body.k) : null;
  if (k) {
    const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1000 ? v : undefined);
    const base: Watch = w && w.key === `${k.type}:${k.id}` ? w : { key: `${k.type}:${k.id}`, type: k.type, id: k.id, title: "", year: "", poster: null, started: Date.now(), runtime: null };
    w = { ...base, s: k.type === "tv" ? n(body?.s) : undefined, e: k.type === "tv" ? n(body?.e) : undefined };
  }
  if (!w) return NextResponse.json({ error: "Start Watching now on a title first." }, { status: 404 });
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 300) : "";
  if (!q) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  try {
    const [l, profile] = await Promise.all([lib(), getProfile().catch(() => null)]);
    return NextResponse.json(await answer(w, l, profile, { q, last: [], spoilers: body?.spoilers === true }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(e); }
}
