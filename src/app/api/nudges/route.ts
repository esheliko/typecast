import { NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";
import { nudges } from "@/lib/nudges";

export async function GET() {
  try {
    return NextResponse.json({ items: await nudges(await getLibrary()) }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
