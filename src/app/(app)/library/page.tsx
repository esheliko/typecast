import { userMessage } from "@/lib/errors";
import Link from "next/link";
import { Suspense } from "react";
import LibraryView from "@/components/LibraryView";
import UpNext from "@/components/UpNext";
import Upcoming, { UpcomingSkeleton } from "@/components/Upcoming";
import { rankUpNext, realServices } from "@/lib/upnext";
import { loadUpNext } from "@/lib/upnext-data";
import { hasUpcomingCandidates, loadUpcoming } from "@/lib/upcoming-data";
import { dayOf } from "@/lib/upcoming";
import { isSort } from "@/lib/library-sort";
import { isKind } from "@/lib/kind";
import { SuggestionRows } from "@/components/cast/CreditList";
import { getLibrary, getProfile } from "@/lib/library";
import { getTitle } from "@/lib/tmdb";
import type { LibItem, Related, Status } from "@/lib/types";

export const metadata = { title: "Library" };

/** Decoration: if it fails for any reason the library itself must still show, with the reason in small text. */
async function Suggestions({ lib }: { lib: LibItem[] }) {
  try { return await suggestionsInner(lib); }
  catch (e) {
    return <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>Suggestions unavailable: {userMessage(e, "library suggestions")}</p>;
  }
}

async function suggestionsInner(lib: LibItem[]) {
  const have = new Set(lib.map((l) => l.key));
  const map = new Map<string, { r: Related; from: string[] }>();
  const titles = await Promise.all(lib.slice(0, 12).map((l) => getTitle(l.type, l.id).catch(() => null)));
  titles.forEach((t) => {
    if (!t) return;
    t.related.forEach((r) => {
      if (have.has(r.key)) return;
      const e = map.get(r.key) ?? { r, from: [] };
      e.from.push(t.title); map.set(r.key, e);
    });
  });
  const sg = [...map.values()].sort((a, b) => b.from.length - a.from.length).slice(0, 8);
  if (!sg.length) return null;
  return (
    <>
      <h2>Suggested from your library</h2>
      <SuggestionRows items={sg.map(({ r, from }) => ({ ...r, why: `Because of ${from.slice(0, 2).join(", ")}` }))} />
    </>
  );
}

/** Watch next ranked on the library alone: instant, and the fallback whenever TMDB is slow or fails. */
const quickPicks = (lib: LibItem[]) => rankUpNext(lib, { now: Date.now(), facts: new Map(), hasServices: false }, new Set(), 32);

/** Watch next with TMDB facts (streaming, taste, new episodes, discoveries). Decoration: on any failure it keeps the quick ranking. */
async function WatchNext({ lib }: { lib: LibItem[] }) {
  try {
    const profile = await getProfile();
    return <UpNext picks={await loadUpNext(lib, profile)} services={realServices(profile.services).length ? "yes" : "no"} />;
  } catch (e) {
    console.error("Watch next failed", e);
    return <UpNext picks={quickPicks(lib)} services="failed" />;
  }
}

/** Decoration: unreleased films and next episodes from the library. On any failure it renders nothing. */
async function UpcomingFromList({ lib }: { lib: LibItem[] }) {
  try {
    const now = Date.now();
    const entries = await loadUpcoming(lib, await getProfile(), now);
    return entries.length ? <Upcoming entries={entries} today={dayOf(now)} /> : null;
  } catch (e) {
    console.error("Upcoming failed", e);
    return null;
  }
}

export default async function Library({ searchParams }: { searchParams: Promise<{ f?: string; s?: string; k?: string }> }) {
  const { f, s, k } = await searchParams;
  let lib: LibItem[];
  try { lib = await getLibrary(); }
  catch (e) {
    return <div className="page"><p className="muted" style={{ marginTop: 20 }}>Could not load your library: {userMessage(e, "library load")}</p></div>;
  }
  const filter = (["watching", "partial", "watchlist", "watched"] as string[]).includes(f ?? "") ? (f as Status) : "all";
  return (
    <div className="page">
      {lib.length === 0 ? (
        <div className="card hero" style={{ marginTop: 18 }}>
          <div className="t">Nothing here yet</div>
          <p className="muted">Find a title on the Browse tab and mark it Watching, To watch or Watched. Suggestions and connections between your titles appear here as your library grows.</p>
          <Link className="btn gold" href="/">Find a title</Link>
        </div>
      ) : <><div className="page-head"><h1>Library</h1><Link href="/library/stats">Stats <span aria-hidden="true">›</span></Link></div><LibraryView items={lib} initial={filter} initialSort={isSort(s) ? s : "added"} initialKind={isKind(k) && k !== "all" ? k : "all"}
        top={<>
          <Suspense fallback={<UpNext picks={quickPicks(lib)} services="pending" />}><WatchNext lib={lib} /></Suspense>
          <Suspense fallback={hasUpcomingCandidates(lib) ? <UpcomingSkeleton /> : null}><UpcomingFromList lib={lib} /></Suspense>
        </>} /></>}
      {lib.length > 0 && <Suspense fallback={null}><Suggestions lib={lib} /></Suspense>}
    </div>
  );
}
