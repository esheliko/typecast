import { NextResponse, type NextRequest } from "next/server";
import { ask, watchCast } from "@/lib/ask";
import { getLibrary } from "@/lib/library";
import { TmdbError } from "@/lib/tmdb";
import { parseWatch, WATCH_COOKIE } from "@/lib/watching";

export const maxDuration = 60;

const current = (req: NextRequest) => parseWatch(req.cookies.get(WATCH_COOKIE)?.value);

/** GET: the faces on screen for the current watch, each with where the user knows them from. */
export async function GET(req: NextRequest) {
  const w = current(req);
  if (!w) return NextResponse.json({ error: "Not watching anything" }, { status: 404 });
  try {
    const { faces } = await watchCast(w, await getLibrary());
    return NextResponse.json({ key: w.key, s: w.s ?? null, e: w.e ?? null, faces }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: e instanceof TmdbError ? e.status : 500 }); }
}

/** POST { messages, spoilers }: streams a plain-text answer about the current watch. */
export async function POST(req: NextRequest) {
  const w = current(req);
  if (!w) return NextResponse.json({ error: "Start Watching now on a title first." }, { status: 404 });
  const body = await req.json().catch(() => null) as { messages?: unknown; spoilers?: unknown } | null;
  const messages = Array.isArray(body?.messages)
    ? body.messages.filter((m): m is { role: "user" | "assistant"; content: string } => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    : [];
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  try {
    const stream = await ask(w, await getLibrary(), { messages, spoilers: body?.spoilers === true });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: e instanceof TmdbError ? e.status : 500 }); }
}
