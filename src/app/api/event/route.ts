import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/library";
import { upcomingFor } from "@/lib/upcoming-data";
import { buildCalendar, icsFileName } from "@/lib/ical";
import { eventFor } from "@/lib/upcoming";

export const dynamic = "force-dynamic";

/**
 * "Add to calendar": a one-event .ics for a film's release or a series' next episode. Signed-in only (the proxy answers 401 otherwise).
 * The browser names the title (`key=movie:603`); the date comes from TMDB here. Served inline as text/calendar so iOS Safari opens its
 * Add to Calendar sheet and Android Chrome downloads a file its calendar opens.
 */
export async function GET(req: NextRequest) {
  const m = /^(movie|tv):(\d{1,9})$/.exec(req.nextUrl.searchParams.get("key") ?? "");
  if (!m) return NextResponse.json({ error: "Bad title" }, { status: 400 });
  try {
    const e = await upcomingFor(m[1] as "movie" | "tv", Number(m[2]), (await getProfile()).country);
    if (!e) return NextResponse.json({ error: "No upcoming date for this title" }, { status: 404 });
    const body = buildCalendar([eventFor(e, req.nextUrl.origin)], { stamp: Date.now() });
    return new NextResponse(body, { headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${icsFileName(e.title)}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch {
    return NextResponse.json({ error: "Could not reach the calendar service. Try again." }, { status: 502 });
  }
}
