import { NextResponse, type NextRequest } from "next/server";
import { getAppearances } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";

/** Which episodes of a series one person was in. `c` is their TMDB credit ids (comma-separated), `n` their episode count. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = +(p.get("tv") ?? 0), n = Math.max(0, +(p.get("n") ?? 0) || 0);
  const ids = (p.get("c") ?? "").split(",").filter((id) => /^[0-9a-f]{20,32}$/.test(id));
  if (!tv || !ids.length) return NextResponse.json({ error: "Missing show or credits" }, { status: 400 });
  try { return NextResponse.json(await getAppearances(tv, ids, n)); }
  catch (err) { const { body, status } = apiError(err, "api/appearances"); return NextResponse.json(body, { status }); }
}
