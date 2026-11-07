import { NextResponse, type NextRequest } from "next/server";
import { getProviders, TmdbError } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const cc = (req.nextUrl.searchParams.get("cc") ?? "US").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return NextResponse.json({ error: "Bad country" }, { status: 400 });
  try { return NextResponse.json({ providers: await getProviders(cc) }); }
  catch (e) { const s = e instanceof TmdbError ? e.status : 500; return NextResponse.json({ error: (e as Error).message }, { status: s }); }
}
