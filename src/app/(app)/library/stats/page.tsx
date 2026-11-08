import Link from "next/link";
import { Suspense } from "react";
import { getLibrary } from "@/lib/library";
import { getTitle } from "@/lib/tmdb";
import { pool, regulars } from "@/lib/connect";
import { formatHours, libraryStats, parseYear, recentWatched, tmdbStats, watchedIn, watchedYears, type StatTitle, type StatYear } from "@/lib/stats";
import { BarList, Extreme, PeopleList, Stat, StatCard, YearPicker } from "@/components/Stats";
import { StatCardsSkeleton } from "@/components/Skeletons";
import { STATUS_LABEL, type LibItem, type Status } from "@/lib/types";

export const metadata = { title: "Library stats" };

/** How many of the most recently watched titles are looked up on TMDB. */
const CAP = 200;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const date = (ms: number) => new Date(ms).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Decoration: a failure shows a small note, never takes the page down. */
async function TmdbStatsSection({ scope, year }: { scope: LibItem[]; year: StatYear }) {
  try {
    const sample = recentWatched(scope, CAP);
    if (!sample.length) return null;
    const titles = await pool(sample, 12, (l) => getTitle(l.type, l.id));
    const ok = titles.flatMap((t) => (t ? [t] : []));
    if (!ok.length) return <p className="muted small">Genres, runtime and people are unavailable right now.</p>;
    const rows: StatTitle[] = ok.map((t) => ({ type: t.type, runtime: t.runtime, genres: t.genres, directors: t.crewBy.director.map((p) => ({ id: p.id, name: p.name })) }));
    const s = tmdbStats(rows);
    const actors = await regulars(sample).catch(() => []);
    const note = [
      scope.length > sample.length ? `Based on the ${sample.length} you watched most recently.` : null,
      ok.length < sample.length ? `${sample.length - ok.length} could not be looked up.` : null,
    ].filter(Boolean).join(" ");
    return (
      <>
        <h2>Details from TMDB</h2>
        <div className="stat-grid">
          <Stat value={formatHours(s.minutes)} label="Film time watched"
            note={s.seriesSkipped ? `Films only: ${plural(s.seriesSkipped, "series", "series")} not timed, TMDB cannot say which episodes you saw.` : undefined} />
        </div>
        {note && <p className="muted small" style={{ margin: "0 0 10px" }}>{note}{s.filmsNoRuntime ? ` ${plural(s.filmsNoRuntime, "film")} without a runtime left out.` : ""}</p>}
        <div className="stat-cards">
          <StatCard title="Top genres"><BarList rows={s.genres} empty="No genres found." /></StatCard>
          <StatCard title="Most-watched directors"><PeopleList people={s.directors} empty="No director has two of your films yet." /></StatCard>
          <StatCard title="Actors you keep seeing"><PeopleList people={actors.slice(0, 8).map((a) => ({ id: a.id, name: a.name, n: a.titles.length }))} empty="No actor shows up twice yet." /></StatCard>
        </div>
        {year !== "all" && <p className="muted small">Actors come from everything watched or in progress, not just {year}.</p>}
      </>
    );
  } catch (e) {
    console.error("Library stats (TMDB) failed", e);
    return <p className="muted small" style={{ marginTop: 20 }}>Genres, runtime and people are unavailable right now.</p>;
  }
}

export default async function LibraryStats({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const { y } = await searchParams;
  let lib: LibItem[];
  try { lib = await getLibrary(); }
  catch (e) {
    console.error("Library load failed", e);
    return <div className="page"><p className="muted" style={{ marginTop: 20 }}>Could not load your library: {e instanceof Error ? e.message : String(e)}</p></div>;
  }
  const years = watchedYears(lib);
  const year = parseYear(y, years);
  let s: ReturnType<typeof libraryStats>;
  try { s = libraryStats(lib, year, Date.now()); }
  catch (e) {
    console.error("Library stats failed", e);
    return <div className="page"><p className="muted" style={{ marginTop: 20 }}>Stats unavailable: {e instanceof Error ? e.message : String(e)}</p></div>;
  }
  const when = year === "all" ? "all time" : String(year);
  const status = (["watched", "watching", "partial", "watchlist"] as Status[]).map((k) => ({ label: STATUS_LABEL[k], n: s.byStatus[k] }));
  return (
    <div className="page">
      <p style={{ margin: "14px 0 8px" }}><Link href="/library">← Library</Link></p>
      <YearPicker years={years} current={year} />
      {s.total === 0 ? <p className="muted" style={{ marginTop: 20 }}>Nothing to count yet. Mark a few titles as watched.</p> : (
        <>
          <div className="stat-grid">
            <Stat value={s.watched} label={`Watched, ${when}`} note={`${plural(s.films, "film")} · ${plural(s.series, "series", "series")}`} />
            <Stat value={s.avgRating == null ? "–" : s.avgRating.toFixed(1)} label="Average rating" note={s.rated ? `${plural(s.rated, "rated title")}` : "No ratings yet"} />
            <Stat value={s.streak ? plural(s.streak.weeks, "week") : "–"} label="Longest streak" note={s.streak ? `${date(s.streak.from)} to ${date(s.streak.to)}` : "Needs watch dates"} />
          </div>
          <div className="stat-cards">
            <StatCard title="Your library"><BarList rows={status} /></StatCard>
            <StatCard title="Watched per month, last 12"><BarList rows={s.perMonth} empty="Nothing watched in the last 12 months." /></StatCard>
            <StatCard title="Watched per year"><BarList rows={s.perYear} empty="No watch dates yet." /></StatCard>
            <StatCard title={`Ratings, ${when}`}>
              <BarList rows={s.ratings.map((n, i) => ({ label: "★".repeat(i + 1), n })).reverse()} empty="No ratings yet." />
            </StatCard>
            <StatCard title={`Release decades, ${when}`}>
              <BarList rows={s.decades} empty="Nothing watched yet." />
              <Extreme label="Oldest" it={s.oldest} />
              <Extreme label="Newest" it={s.newest} />
            </StatCard>
          </div>
          <Suspense fallback={<StatCardsSkeleton />}><TmdbStatsSection scope={watchedIn(lib, year)} year={year} /></Suspense>
        </>
      )}
    </div>
  );
}
