import type { NextRequest } from "next/server";
import { bad, failWho, okWho, posParam, titleParam } from "@/lib/who-api";
import { loadCommon, loadWhoRoster } from "@/lib/who-data";

export const maxDuration = 60;

/** GET ?q=big+bang&k=tv-79744&s=2&e=8: the top three titles matching q and who in the roster at that position was in each. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  const t = titleParam(p.get("k"));
  if (q.length < 2 || !t) return bad("Missing search or title");
  try {
    const roster = await loadWhoRoster(t.type, t.id, t.type === "tv" ? posParam(p) : null);
    return okWho({ titles: await loadCommon(q, new Set(roster.faces.map((f) => f.id))) }, 1800);
  } catch (e) { return failWho(e); }
}
