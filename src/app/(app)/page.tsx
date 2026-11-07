import { Suspense } from "react";
import Search from "@/components/Search";
import { PosterStrip } from "@/components/ui";
import { getLibrary } from "@/lib/library";
import { trending } from "@/lib/tmdb";

async function Trending() {
  try { return <><h2>Trending this week</h2><PosterStrip items={await trending()} /></>; }
  catch (e) { return <p className="err small" style={{ marginTop: 20 }}>{(e as Error).message}</p>; }
}

export default async function Home() {
  const lib = await getLibrary();
  const watching = lib.filter((l) => l.status === "watching");
  return (
    <div className="home page">
      <Search lib={Object.fromEntries(lib.map((l) => [l.key, l.status]))} />
      <div className="extras">
        {watching.length > 0 && <><h2>Watching now</h2><PosterStrip items={watching} sub={(i) => { const l = lib.find((x) => x.key === i.key); return l?.progress ? `S${l.progress.s} E${l.progress.e}` : i.year; }} /></>}
        <Suspense fallback={<p className="muted" style={{ marginTop: 20 }}><span className="spin" />Loading trending</p>}><Trending /></Suspense>
      </div>
    </div>
  );
}
