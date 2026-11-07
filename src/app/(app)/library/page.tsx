import Link from "next/link";
import { Suspense } from "react";
import LibraryList from "@/components/LibraryList";
import { TitleRow } from "@/components/ui";
import { getLibrary } from "@/lib/library";
import { getTitle } from "@/lib/tmdb";
import { STATUS_LABEL, type LibItem, type Related, type Status } from "@/lib/types";

export const metadata = { title: "Library" };

async function Suggestions({ lib }: { lib: LibItem[] }) {
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
      <div className="card"><ul className="rows">
        {sg.map(({ r, from }) => <li key={r.key}><TitleRow it={r} sub={`Because of ${from.slice(0, 2).join(", ")}`} small /></li>)}
      </ul></div>
    </>
  );
}

export default async function Library({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const lib = await getLibrary();
  const filter = (["watching", "partial", "watchlist", "watched"] as string[]).includes(f ?? "") ? (f as Status) : "all";
  const count = (s: Status | "all") => (s === "all" ? lib.length : lib.filter((l) => l.status === s).length);
  const rank = (l: LibItem) => (l.status === "watchlist" && l.priority === "must" ? 0 : 1);
  const picked = filter === "all" ? lib : lib.filter((l) => l.status === filter);
  const shown = filter === "watchlist" ? [...picked].sort((a, b) => rank(a) - rank(b)) : picked; // must-watch first (stable sort keeps newest-first)
  const tabs: [Status | "all", string][] = [["all", "All"], ["watching", STATUS_LABEL.watching], ["partial", STATUS_LABEL.partial], ["watchlist", STATUS_LABEL.watchlist], ["watched", STATUS_LABEL.watched]];
  return (
    <div className="page">
      <div className="chips" role="group" aria-label="Filter">
        {tabs.map(([k, label]) => <Link key={k} className="chip" href={k === "all" ? "/library" : `/library?f=${k}`} aria-pressed={filter === k}>{label} <span className="mono">{count(k)}</span></Link>)}
      </div>
      {lib.length === 0 ? (
        <div className="card hero" style={{ marginTop: 18 }}>
          <div className="t">Nothing here yet</div>
          <p className="muted">Find a title on the Cast tab and mark it Watching, To watch or Watched. Suggestions and connections between your titles appear here as your library grows.</p>
          <Link className="btn gold" href="/">Find a title</Link>
        </div>
      ) : <LibraryList items={shown} />}
      {lib.length > 0 && <Suspense fallback={null}><Suggestions lib={lib} /></Suspense>}
    </div>
  );
}
