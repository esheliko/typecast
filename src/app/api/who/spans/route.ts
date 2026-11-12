import type { NextRequest } from "next/server";
import { bad, failWho, intParam, keyList, okWho, posParam, titleParam } from "@/lib/who-api";
import { isCid, loadSpans } from "@/lib/who-data";

export const maxDuration = 60;

/**
 * GET ?p=10131&keys=tv:1418,tv:79744[&cur=tv-79744&s=2&e=8&cids=a,b]: the person's own first-to-last episode dates in each series.
 * `cur` is the show being watched: its dates are clipped to the position, so nothing later is given away.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = intParam(q.get("p"));
  const keys = keyList(q.get("keys"), 14);
  if (!p || !keys.length) return bad("Missing person or titles");
  const cur = titleParam(q.get("cur"));
  const cids = (q.get("cids") ?? "").split(",").filter(isCid).slice(0, 12);
  try { return okWho(await loadSpans(p, keys, cur?.type === "tv" ? { key: cur.key, pos: q.get("s") == null ? null : posParam(q), cids } : undefined), 600); } catch (e) { return failWho(e); }
}
