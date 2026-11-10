import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho } from "@/lib/who-api";
import { loadSeason } from "@/lib/who-data";
import { getProfile } from "@/lib/library";
import { todayFor } from "@/lib/today";

/** GET ?tv=79744&s=2[&e=8]: a season's episodes for the episode select (no summaries), and with e that episode's card. Specials are s=0. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = intParam(p.get("tv")), s = Number(p.get("s"));
  if (!tv || !Number.isInteger(s) || s < 0 || s > 200) return bad("Missing show or season");
  const e = intParam(p.get("e")) ?? undefined;
  try { return okWho(await loadSeason(tv, s, e, todayFor((await getProfile().catch(() => null))?.country)), 300); } catch (err) { return failWho(err); }
}
