import type { NextRequest } from "next/server";
import { bad, failWho, intParam, keyList, okWho, posParam, titleParam } from "@/lib/who-api";
import { isCid, loadSpans } from "@/lib/who-data";
import { lineForMany } from "@/lib/spoiler-line-data";
import { lineContextFrom, NONE as NONE_LINE, revealedKeys } from "@/lib/spoiler-line";

export const maxDuration = 60;

/**
 * GET ?p=10131&keys=tv:1418,tv:79744[&cur=tv-79744&s=2&e=8&cids=a,b]: the person's own first-to-last episode dates in each series.
 * `cur` is the show being watched: its dates are clipped to the position, so nothing later is given away.
 * Every OTHER series that is Watching in the library keeps its own spoiler line (docs/features/spoilers.md): `pg` (+ `ps=1`) names the page's
 * title, which the page governs itself; `reveal=1` (every key asked) or `reveal=tv:1,tv:2` lifts it for those keys, for that view only.
 * The answer depends on the library, so it is not cached by the browser.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = intParam(q.get("p"));
  const keys = keyList(q.get("keys"), 14);
  if (!p || !keys.length) return bad("Missing person or titles");
  const cur = titleParam(q.get("cur"));
  const cids = (q.get("cids") ?? "").split(",").filter(isCid).slice(0, 12);
  try {
    const lines = await lineForMany(keys, lineContextFrom((n) => q.get(n)));
    // The watched title is governed by the page (cur / pg); a revealed key is lifted for this request only.
    for (const k of revealedKeys(q.get("reveal"), keys)) lines[k] = NONE_LINE;
    if (cur) lines[cur.key] = NONE_LINE;
    return okWho(await loadSpans(p, keys, cur?.type === "tv" ? { key: cur.key, pos: q.get("s") == null ? null : posParam(q), cids } : undefined, lines), 0);
  } catch (e) { return failWho(e); }
}
