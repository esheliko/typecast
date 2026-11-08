import { NextResponse } from "next/server";
import { recheckEpisodes } from "@/lib/library";

export const dynamic = "force-dynamic";

/**
 * New-episode + Letterboxd check, called by `RecheckOnce` once per browser session. It is a route and not a server action
 * because actions run one at a time per client: a slow TMDB check would hold up the user's quick marks.
 */
export async function POST() {
  const moved = await recheckEpisodes().catch(() => false);
  return NextResponse.json({ moved });
}
