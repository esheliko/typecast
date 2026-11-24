import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho, titleParam } from "@/lib/who-api";
import { loadWhoPerson } from "@/lib/who-data";
import { getLibrary } from "@/lib/library";
import { libraryRoles } from "@/lib/glimpse";
import { loadSeenWatching } from "@/lib/who-seen-data";

export const maxDuration = 30;

/**
 * GET ?p=10131[&k=tv:79744]: the actor's roles in titles the signed-in user has marked Watched or Partial, plus Watching series the actor already appeared in by the
 * saved place (the same "seen" rule as the Finder tiles, so a pill never gives away that someone shows up later); not the title `k` itself: one extra Glimpse tab each.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const pid = intParam(q.get("p"));
  if (!pid) return bad("Missing person");
  const exclude = titleParam(q.get("k"))?.key;
  const first = titleParam(q.get("f"))?.key;
  try {
    const [p, lib] = await Promise.all([loadWhoPerson(pid), getLibrary()]);
    const watching = lib.filter((i) => i.status === "watching" && i.key.startsWith("tv:") && i.progress).map((i) => i.key);
    const seenW = watching.length ? await loadSeenWatching(pid, p.credits.map((c) => c.key).filter((k) => watching.includes(k)).slice(0, 12)).catch(() => []) : [];
    const keys = new Set([...lib.filter((i) => i.status === "watched" || i.status === "partial").map((i) => i.key), ...seenW]);
    return okWho({ roles: libraryRoles(p.credits, keys, exclude, first) }, 0);
  } catch (e) { return failWho(e); }
}
