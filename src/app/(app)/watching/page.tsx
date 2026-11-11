import Link from "next/link";
import { cookies } from "next/headers";
import { WhoApp } from "@/components/who/WhoApp";
import { WhoStart } from "@/components/who/WhoStart";
import { loadBrief } from "@/lib/who-data";
import { parseUrlKey, posFromParams } from "@/lib/who-scope";
import { getProfile } from "@/lib/library";
import { todayFor } from "@/lib/today";
import { parseWatch, WATCH_COOKIE } from "@/lib/watching";
import type { Pos } from "@/lib/who-types";

export const metadata = { title: "Watching now" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Watching now: who is on screen, where you know them from, and facts about the title. Which title:
 * `?k=tv-79744`, else the current watch. Where you are: `?s=2&e=8` in the URL, else the watch cookie, else not set.
 */
export default async function WhoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const watch = parseWatch((await cookies()).get(WATCH_COOKIE)?.value);
  const k = parseUrlKey(one(sp.k));
  const target = k ?? (watch ? { type: watch.type, id: watch.id } : null);
  if (!target) return <WhoStart />;
  const brief = await loadBrief(target.type, target.id).catch(() => null);
  if (!brief) {
    return (
      <div className="wx wx-start"><div className="wx-startbox">
        <h1 className="wx-startt">Couldn&rsquo;t load that title</h1>
        <p className="muted">TMDB did not answer. Try again in a moment.</p>
        <Link className="btn" href="/watching">Start again</Link>
      </div></div>
    );
  }
  let pos: Pos | null = null;
  if (target.type === "tv") {
    const mine = watch && watch.key === brief.key ? watch : null;
    const fromUrl = one(sp.s) != null;
    pos = fromUrl ? posFromParams(one(sp.s), one(sp.e)) : mine ? (mine.pos ?? { s: mine.s ?? 1, e: mine.e ?? 1 }) : { s: null, e: null };
  }
  const today = todayFor((await getProfile().catch(() => null))?.country);
  return <WhoApp key={`${brief.key}`} brief={brief} initialPos={pos} today={today} />;
}
