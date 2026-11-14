import type { NextRequest } from "next/server";
import { bad, failWho, intParam, keyList, okWho } from "@/lib/who-api";
import { loadSeenWatching } from "@/lib/who-seen-data";

export const maxDuration = 30;

/** GET ?p=<person>&keys=tv:1,tv:2: which of those Watching series the person already appeared in by the saved place. Depends on the library: never cached. */
export async function GET(req: NextRequest) {
  const p = intParam(req.nextUrl.searchParams.get("p"));
  if (!p) return bad("p is required");
  try { return okWho({ seen: await loadSeenWatching(p, keyList(req.nextUrl.searchParams.get("keys"), 12)) }, 0); } catch (e) { return failWho(e); }
}
