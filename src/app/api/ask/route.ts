import { NextResponse, type NextRequest } from "next/server";
import { answer } from "@/lib/answer";
import { getLibrary, getProfile } from "@/lib/library";
import { findPeople, loadHits, loadPerson, loadRoster } from "@/lib/roster-data";
import { TmdbError } from "@/lib/tmdb";
import { parseWatch, WATCH_COOKIE, type Watch } from "@/lib/watching";
import { parseUrlKey } from "@/lib/who-scope";

export const maxDuration = 60;

const current = (req: NextRequest) => parseWatch(req.cookies.get(WATCH_COOKIE)?.value);
const num = (v: string | null) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof TmdbError ? e.status : 500 });
const lib = () => getLibrary().catch(() => []);

/**
 * GET (the current watch, from its cookie), no AI:
 *   ?s=&e=       who can be on screen at that episode (a film ignores them)
 *   ?hits=1,2,3  which of those people the user has seen elsewhere in the library
 *   ?person=ID   one person's library titles and best-known work
 *   ?find=name   people anywhere on TMDB
 */
export async function GET(req: NextRequest) {
  const w = current(req);
  if (!w) return NextResponse.json({ error: "Not watching anything" }, { status: 404 });
  const p = req.nextUrl.searchParams;
  try {
    const hits = p.get("hits");
    if (hits) return NextResponse.json({ hits: await loadHits(hits.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0), await lib(), w.key) }, { headers: { "Cache-Control": "private, max-age=600" } });
    const person = num(p.get("person"));
    if (person) return NextResponse.json(await loadPerson(person, await lib(), w.key), { headers: { "Cache-Control": "private, max-age=600" } });
    const find = p.get("find")?.trim().slice(0, 80);
    if (find) return NextResponse.json({ people: await findPeople(find) }, { headers: { "Cache-Control": "private, max-age=600" } });
    const pos = w.type === "tv" ? { s: num(p.get("s")) ?? w.s ?? 1, e: num(p.get("e")) ?? w.e ?? 1 } : null;
    return NextResponse.json(await loadRoster(w.type, w.id, pos), { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) { return fail(e); }
}

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
