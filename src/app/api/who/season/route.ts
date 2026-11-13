import type { NextRequest } from "next/server";
import { bad, failWho, intParam, okWho } from "@/lib/who-api";
import { loadSeason } from "@/lib/who-data";
import { getProfile } from "@/lib/library";
import { todayFor } from "@/lib/today";
import { clipUpto } from "@/lib/place-strip";

/** GET ?tv=79744&s=2[&e=8]: a season's episodes for the episode select (no summaries), and with e that episode's card. Specials are s=0. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tv = intParam(p.get("tv")), s = Number(p.get("s"));
  if (!tv || !Number.isInteger(s) || s < 0 || s > 200) return bad("Missing show or season");
  const e = intParam(p.get("e")) ?? undefined;
  // `upto`: the place card asks only for the episodes up to the one it shows, so nothing later is sent to the browser.
  const upto = intParam(p.get("upto")) ?? undefined;
  try {
    const r = await loadSeason(tv, s, e, todayFor((await getProfile().catch(() => null))?.country));
    return okWho(upto ? { ...r, episodes: clipUpto(r.episodes, upto), detail: r.detail && r.detail.e <= upto ? r.detail : null } : r, 300);
  } catch (err) { return failWho(err); }
}
