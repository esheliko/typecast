import { NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";
import { nudges } from "@/lib/nudges";
import { apiError } from "@/lib/errors";

export async function GET(req: Request) {
  const round = Math.max(0, Math.min(1000, parseInt(new URL(req.url).searchParams.get("r") ?? "0", 10) || 0));
  try {
    return NextResponse.json({ items: await nudges(await getLibrary(), round) }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) { const r = apiError(e, "api/nudges"); return NextResponse.json(r.body, { status: r.status }); }
}
