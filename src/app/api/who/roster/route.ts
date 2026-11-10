import type { NextRequest } from "next/server";
import { bad, failWho, okWho, posParam, titleParam } from "@/lib/who-api";
import { loadWhoRoster } from "@/lib/who-data";

export const maxDuration = 60;

/** GET ?k=tv-79744&s=2&e=8: who can be on screen at that position (a film ignores s and e). Never includes anyone from after the position. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const t = titleParam(p.get("k"));
  if (!t) return bad("Missing or invalid title");
  try { return okWho(await loadWhoRoster(t.type, t.id, t.type === "tv" ? posParam(p) : null)); } catch (e) { return failWho(e); }
}
