import Link from "next/link";
import { Suspense } from "react";
import LibraryView from "@/components/LibraryView";
import UpNext from "@/components/UpNext";
import { rankUpNext } from "@/lib/upnext";
import { loadUpNext } from "@/lib/upnext-data";
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
    console.error("Library suggestions failed", e);
    return <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>Suggestions unavailable: {e instanceof Error ? e.message : String(e)}</p>;
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
  try { return <UpNext picks={await loadUpNext(lib, await getProfile())} />; }
  catch (e) {
    console.error("Watch next failed", e);
    return <UpNext picks={quickPicks(lib)} />;
  }
}

export default async function Library({ searchParams }: { searchParams: Promise<{ f?: string; s?: string; k?: string }> }) {
  const { f, s, k } = await searchParams;
  let lib: LibItem[];
  try { lib = await getLibrary(); }
  catch (e) {
    console.error("Library load failed", e);
    return <div className="page"><p className="muted" style={{ marginTop: 20 }}>Could not load your library: {e instanceof Error ? e.message : String(e)}</p></div>;
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
      ) : <><p style={{ margin: "14px 0 0" }}><Link className="chip" href="/library/stats" style={{ display: "inline-block" }}>Stats</Link></p><LibraryView items={lib} initial={filter} initialSort={isSort(s) ? s : "added"} initialKind={isKind(k) && k !== "all" ? k : "all"}
        top={<Suspense fallback={<UpNext picks={quickPicks(lib)} />}><WatchNext lib={lib} /></Suspense>} /></>}
      {lib.length > 0 && <Suspense fallback={null}><Suggestions lib={lib} /></Suspense>}
    </div>
  );
}
