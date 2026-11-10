import type { NextRequest } from "next/server";
import { bad, failWho, idList, intParam, okWho, titleParam } from "@/lib/who-api";
import { loadShared } from "@/lib/who-data";

export const maxDuration = 60;

/** GET ?id=10131&with=1,2,3&cur=tv-79744: which of the others this person has been in titles with (the current title left out). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = intParam(q.get("id"));
  if (!id) return bad("Missing person");
  try { return okWho({ shared: await loadShared(id, idList(q.get("with"), 30), titleParam(q.get("cur"))?.key ?? "") }, 1800); } catch (e) { return failWho(e); }
}
