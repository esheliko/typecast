import Link from "next/link";
import { Suspense } from "react";
import LibraryView from "@/components/LibraryView";
import { TitleRow } from "@/components/ui";
import { getLibrary } from "@/lib/library";
import { getTitle } from "@/lib/tmdb";
import type { LibItem, Related, Status } from "@/lib/types";

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
  return (
    <div className="page">
      {lib.length === 0 ? (
        <div className="card hero" style={{ marginTop: 18 }}>
          <div className="t">Nothing here yet</div>
          <p className="muted">Find a title on the Browse tab and mark it Watching, To watch or Watched. Suggestions and connections between your titles appear here as your library grows.</p>
          <Link className="btn gold" href="/">Find a title</Link>
        </div>
      ) : <LibraryView items={lib} initial={filter} />}
      {lib.length > 0 && <Suspense fallback={null}><Suggestions lib={lib} /></Suspense>}
    </div>
  );
}
