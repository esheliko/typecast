import { NextResponse, type NextRequest } from "next/server";
import { answer, watchCast } from "@/lib/answer";
import { ask, aiEnabled } from "@/lib/ask";
import { getLibrary, getProfile } from "@/lib/library";
import { TmdbError } from "@/lib/tmdb";
import { parseWatch, WATCH_COOKIE } from "@/lib/watching";

export const maxDuration = 60;

const current = (req: NextRequest) => parseWatch(req.cookies.get(WATCH_COOKIE)?.value);

/** GET: the faces on screen for the current watch, each with where the user knows them from. */
export async function GET(req: NextRequest) {
  const w = current(req);
  if (!w) return NextResponse.json({ error: "Not watching anything" }, { status: 404 });
  try {
    const { faces } = await watchCast(w, await getLibrary().catch(() => []));
    return NextResponse.json({ key: w.key, s: w.s ?? null, e: w.e ?? null, faces, ai: aiEnabled() }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: e instanceof TmdbError ? e.status : 500 }); }
}

type Msg = { role: "user" | "assistant"; content: string };

/**
 * POST { q, last, spoilers }: a structured answer (JSON) from TMDB, Wikidata, Wikipedia and the library. No AI.
 * With ASK_AI=1 (benched) and { messages }, streams a plain-text AI answer instead.
 */
export async function POST(req: NextRequest) {
  const w = current(req);
  if (!w) return NextResponse.json({ error: "Start Watching now on a title first." }, { status: 404 });
  const body = await req.json().catch(() => null) as { q?: unknown; last?: unknown; spoilers?: unknown; messages?: unknown } | null;
  const spoilers = body?.spoilers === true;
  try {
    if (aiEnabled() && Array.isArray(body?.messages)) {
      const messages = (body.messages as Msg[]).filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim());
      if (!messages.length) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
      const stream = await ask(w, await getLibrary(), { messages, spoilers });
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    const q = typeof body?.q === "string" ? body.q.trim().slice(0, 300) : "";
    if (!q) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
    const last = Array.isArray(body?.last) ? body.last.filter((x): x is number => Number.isInteger(x) && x > 0).slice(0, 3) : [];
    const [lib, profile] = await Promise.all([getLibrary().catch(() => []), getProfile().catch(() => null)]);
    return NextResponse.json(await answer(w, lib, profile, { q, last, spoilers }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: e instanceof TmdbError ? e.status : 500 }); }
}
