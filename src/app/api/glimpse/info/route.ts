import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho, titleParam } from "@/lib/who-api";
import { posFromParams } from "@/lib/who-scope";
import { loadAbout } from "@/lib/glimpse-data";
import { getLibraryItem } from "@/lib/library";

export const maxDuration = 30;

/**
 * GET ?k=tv:79744&p=10131[&ch=Nell&c=1&s=2&e=8&ns=1&h=The+Rookie]: the About part of the Glimpse panel. A title (k), a person (p) or the person in
 * the title (both). `c=1` with s/e is the Watching-now position: nothing after it is told. `ns=1` is the No spoilers switch (shorter notes);
 * `h` is the show being watched, whose name is kept out of biographies. Signed-in only (src/proxy.ts).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const t = titleParam(q.get("k"));
  const pid = intParam(q.get("p"));
  if (!t && !pid) return bad("Missing title or person");
  const clip = q.get("c") === "1" ? posFromParams(q.get("s"), q.get("e")) : null;
  try {
    // Marked Watched in the library = fully seen: only then is the whole story told.
    const watched = t ? (await getLibraryItem(`${t.type}:${t.id}`).catch(() => null))?.status === "watched" : false;
    return okWho(await loadAbout({ watched,
      ...(t ? { type: t.type, id: t.id } : {}), ...(pid ? { pid } : {}),
      char: q.get("ch")?.trim().slice(0, 80) || undefined, clip, nospoil: q.get("ns") === "1", hide: q.get("h")?.trim().slice(0, 80) || undefined,
    }), 0);
  } catch (e) { return failWho(e); }
}
