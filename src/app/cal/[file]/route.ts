import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCalendar } from "@/lib/ical";
import { feedLibrary, tokenFromFile } from "@/lib/calendar-token";
import { loadUpcoming } from "@/lib/upcoming-data";
import { eventFor } from "@/lib/upcoming";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/**
 * The subscribable calendar: unreleased films and next episodes from one person's library. Open to the world on purpose (calendar apps
 * send no cookies); the secret token in the address is the only credential. It reaches the library through the `calendar_library`
 * database function, which takes the token and returns nothing else. It fails closed: a bad token, a missing function (migration 0009
 * not applied) or any error is the same plain 404, and no signed-in user is ever consulted.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const token = tokenFromFile((await ctx.params).file);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return NOT_FOUND();
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.rpc("calendar_library", { tok: token });
    const feed = error ? null : feedLibrary(data);
    if (!feed) return NOT_FOUND();
    const now = Date.now();
    // A failed lookup is "try later", never an empty calendar: a calendar app would take that as "every event was removed".
    let entries: Awaited<ReturnType<typeof loadUpcoming>>;
    try { entries = await loadUpcoming(feed.lib, { country: feed.country, services: [] }, now); }
    catch { return new NextResponse("Temporarily unavailable", { status: 503, headers: { "Retry-After": "900", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }); }
    const body = buildCalendar(entries.map((e) => eventFor(e, req.nextUrl.origin)), { stamp: now, name: "Typecast: upcoming", feed: true });
    return new NextResponse(body, { headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="typecast.ics"',
      "Cache-Control": "private, max-age=1800",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    } });
  } catch {
    return NOT_FOUND();
  }
}
