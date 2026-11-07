import { Suspense } from "react";
import BrowseFilters from "@/components/BrowseFilters";
import BrowseResults from "@/components/BrowseResults";
import Search from "@/components/Search";
import { PosterStrip } from "@/components/ui";
import { isActive, parseBrowse, toParams, type BrowseQuery } from "@/lib/browse";
import { getLibrary, getProfile } from "@/lib/library";
import { discover, genreList, trending } from "@/lib/tmdb";
import type { Status } from "@/lib/types";

async function Trending() {
  try { return <><h2>Trending this week</h2><PosterStrip items={await trending()} /></>; }
  catch (e) { return <p className="err small" style={{ marginTop: 20 }}>{(e as Error).message}</p>; }
}

async function Results({ q, lib }: { q: BrowseQuery; lib: Record<string, Status> }) {
  try {
    const profile = await getProfile();
    const first = await discover(q, 1, profile.country, profile.services);
    return <BrowseResults key={toParams(q).toString()} initial={first.items} page={first.page} totalPages={first.totalPages} notice={first.notice} query={toParams(q).toString()} lib={lib} />;
  } catch (e) { return <p className="err small" style={{ marginTop: 20 }}>{(e as Error).message}</p>; }
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = parseBrowse(await searchParams);
  const active = isActive(q);
  const [libItems, profile, genres] = await Promise.all([getLibrary(), getProfile(), genreList(q.type).catch(() => [])]);
  const lib = Object.fromEntries(libItems.map((l) => [l.key, l.status]));
  const watching = libItems.filter((l) => l.status === "watching");
  return (
    <div className="home page">
      <Search lib={lib} />
      <div className="extras">
        <BrowseFilters q={q} genres={genres} canFilterMine={profile.services.length > 0} active={active} />
        {active ? (
          <Suspense key={toParams(q).toString()} fallback={<p className="muted" style={{ marginTop: 20 }}><span className="spin" />Finding titles</p>}>
            <Results q={q} lib={lib} />
          </Suspense>
        ) : (
          <>
            {watching.length > 0 && <><h2>Watching now</h2><PosterStrip items={watching} sub={(i) => { const l = libItems.find((x) => x.key === i.key); return l?.progress ? `S${l.progress.s} E${l.progress.e}` : i.year; }} /></>}
            <Suspense fallback={<p className="muted" style={{ marginTop: 20 }}><span className="spin" />Loading trending</p>}><Trending /></Suspense>
          </>
        )}
      </div>
    </div>
  );
}
