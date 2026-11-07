import { NextResponse, type NextRequest } from "next/server";
import { suggest, TmdbError, type SuggestKind } from "@/lib/tmdb";

const KINDS: SuggestKind[] = ["person", "company", "keyword"];

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") as SuggestKind;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ options: [] });
  try { return NextResponse.json({ options: await suggest(kind, q) }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } }); }
  catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
