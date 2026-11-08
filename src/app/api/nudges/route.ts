import { NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";
import { nudges } from "@/lib/nudges";

export async function GET(req: Request) {
  const round = Math.max(0, Math.min(1000, parseInt(new URL(req.url).searchParams.get("r") ?? "0", 10) || 0));
  try {
    return NextResponse.json({ items: await nudges(await getLibrary(), round) }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
