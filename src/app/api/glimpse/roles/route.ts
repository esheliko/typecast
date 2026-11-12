import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho, titleParam } from "@/lib/who-api";
import { loadWhoPerson } from "@/lib/who-data";
import { getLibrary } from "@/lib/library";
import { libraryRoles } from "@/lib/glimpse";

export const maxDuration = 30;

/** GET ?p=10131[&k=tv:79744]: the actor's roles in titles in the signed-in user's library (not the title `k` itself): one extra Glimpse tab each. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const pid = intParam(q.get("p"));
  if (!pid) return bad("Missing person");
  const exclude = titleParam(q.get("k"))?.key;
  try {
    const [p, lib] = await Promise.all([loadWhoPerson(pid), getLibrary()]);
    return okWho({ roles: libraryRoles(p.credits, new Set(lib.map((i) => i.key)), exclude) }, 0);
  } catch (e) { return failWho(e); }
}
