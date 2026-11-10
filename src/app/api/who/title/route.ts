import type { NextRequest } from "next/server";
import { bad, failWho, okWho, titleParam } from "@/lib/who-api";
import { loadTitleNode } from "@/lib/who-data";

export const maxDuration = 60;

/** GET ?k=movie-603: the title's facts and whole cast, for the title node. */
export async function GET(req: NextRequest) {
  const t = titleParam(req.nextUrl.searchParams.get("k"));
  if (!t) return bad("Missing or invalid title");
  try { return okWho(await loadTitleNode(t.type, t.id), 1800); } catch (e) { return failWho(e); }
}
