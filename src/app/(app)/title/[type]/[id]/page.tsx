import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BackButton from "@/components/BackButton";
import CastFilter from "@/components/CastFilter";
import { CreditRow } from "@/components/CreditRow";
import EpisodeCast from "@/components/EpisodeCast";
import NoteBox from "@/components/NoteBox";
import StatusControls from "@/components/StatusControls";
import { TitleRow } from "@/components/ui";
import { Where } from "@/components/Where";
import { enrich } from "@/lib/enrich";
import { img, typeLabel } from "@/lib/img";
import { getLibrary, getProfile } from "@/lib/library";
import { getCollection, getTitle, TmdbError } from "@/lib/tmdb";
import type { LibItem, MediaType, Title } from "@/lib/types";

type Props = { params: Promise<{ type: string; id: string }> };

async function load(p: Props["params"]) {
  const { type, id } = await p;
  if ((type !== "movie" && type !== "tv") || !/^\d+$/.test(id)) notFound();
  try { return await getTitle(type as MediaType, +id); }
  catch (e) { if (e instanceof TmdbError && e.status === 404) notFound(); throw e; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try { const t = await load(params); return { title: t.title }; } catch { return { title: "Title" }; }
}

async function Cast({ t, lib }: { t: Title; lib: LibItem[] }) {
  const people = await enrich(t.people, lib, t.key);
  const libKeys = Object.fromEntries(lib.map((l) => [l.key, l.status]));
  const links = new Map<string, string[]>();
  for (const c of people) for (const h of c.hits) links.set(h.key, [...(links.get(h.key) ?? []), c.name]);
  const linked = [...links.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  return (
    <>
      <h2>Cast</h2>
      <div className="card pad">
        <CastFilter><ul className="credits">{people.map((c) => <CreditRow key={c.id} c={c} libKeys={libKeys} />)}</ul></CastFilter>
      </div>
      {linked.length > 0 && (
        <>
          <h2>Connected to your library</h2>
          <div className="card"><ul className="rows">
            {linked.map(([key, names]) => { const l = lib.find((x) => x.key === key)!; return <li key={key}><TitleRow it={l} lib={l} sub={names.slice(0, 4).join(", ")} small /></li>; })}
          </ul></div>
        </>
      )}
    </>
  );
}

async function Related({ t, lib }: { t: Title; lib: LibItem[] }) {
  let list = t.related;
  if (t.collection) {
    try {
      const parts = (await getCollection(t.collection)).filter((p) => p.key !== t.key);
      const have = new Set(parts.map((p) => p.key));
      list = [...parts, ...t.related.filter((r) => !have.has(r.key))];
    } catch { /* keep recommendations only */ }
  }
  if (!list.length) return null;
  return (
    <>
      <h2>Related</h2>
      <div className="card"><ul className="rows">
        {list.map((r) => <li key={r.key}><TitleRow it={r} lib={lib.find((l) => l.key === r.key)} sub={r.rel} small /></li>)}
      </ul></div>
    </>
  );
}

export default async function TitlePage({ params }: Props) {
  const t = await load(params);
  const [lib, profile] = await Promise.all([getLibrary(), getProfile()]);
  const mine = lib.find((l) => l.key === t.key) ?? null;
  const meta = [t.year, typeLabel(t.type), t.runtime ? `${t.runtime} min${t.type === "tv" ? " / ep" : ""}` : "", t.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  return (
    <article className="page">
      <div className="pagebar"><BackButton /></div>
      <div className="sh-top" style={{ marginTop: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {t.poster && <img className="sh-poster" src={img(t.poster, "w342")} alt="" />}
        <div style={{ minWidth: 0 }}>
          <h1 className="sh-title">{t.title}</h1>
          <div className="sh-meta">{meta}</div>
          {t.crew.length > 0 && <div className="sh-meta">{t.type === "tv" ? "Created by " : "Directed by "}{t.crew.slice(0, 2).join(", ")}</div>}
        </div>
      </div>
      {t.overview && <p style={{ margin: "14px 0 0" }}>{t.overview}</p>}
      <StatusControls item={t} lib={mine} />
      <Where t={t} profile={profile} />
      {t.type === "tv" && t.seasons.length > 0 && (
        <>
          <h2>Episode cast</h2>
          <EpisodeCast tvId={t.id} seasons={t.seasons} initial={mine?.progress ?? { s: t.seasons[0].n, e: 1 }} inLibrary={!!mine} />
        </>
      )}
      <Suspense fallback={<><h2>Cast</h2><p className="muted"><span className="spin" />Finding where you know them from</p></>}>
        <Cast t={t} lib={lib} />
      </Suspense>
      <Suspense fallback={null}><Related t={t} lib={lib} /></Suspense>
      <h2>Notes</h2>
      <NoteBox type={t.type} id={t.id} initial={mine?.note ?? ""} enabled={!!mine} />
    </article>
  );
}
