import type { NextRequest } from "next/server";
import { bad, failWho, okWho, titleParam } from "@/lib/who-api";
import { loadTitleNode } from "@/lib/who-data";
import { lineFor } from "@/lib/spoiler-line-data";
import { hiddenOf, holdBackBrief, lineContextFrom } from "@/lib/spoiler-line";

export const maxDuration = 60;

/**
 * GET ?k=movie-603[&pg=tv-79744&ps=1&reveal=1]: the title's facts and whole cast, for the title node. A series that is Watching in the library keeps its
 * spoiler line (docs/features/spoilers.md): no end date, status or later seasons, and a `hidden` marker; `reveal=1` lifts it for that view only.
 * The answer depends on the library, so it is not cached by the browser.
 */
export async function GET(req: NextRequest) {
  const t = titleParam(req.nextUrl.searchParams.get("k"));
  if (!t) return bad("Missing or invalid title");
  try {
    const [node, line] = await Promise.all([loadTitleNode(t.type, t.id), lineFor(t.key, lineContextFrom((n) => req.nextUrl.searchParams.get(n)))]);
    return okWho(line.kind === "none" ? node : { ...node, brief: holdBackBrief(node.brief, line), hidden: hiddenOf(line) }, 0);
  } catch (e) { return failWho(e); }
}
