import { NextResponse, type NextRequest } from "next/server";
import { getProviders } from "@/lib/tmdb";
import { apiError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const cc = (req.nextUrl.searchParams.get("cc") ?? "US").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return NextResponse.json({ error: "Bad country" }, { status: 400 });
  try { return NextResponse.json({ providers: await getProviders(cc) }, { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } }); }
  catch (e) { const r = apiError(e, "api/providers"); return NextResponse.json(r.body, { status: r.status }); }
}
