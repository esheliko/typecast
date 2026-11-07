import Link from "next/link";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import CastFilter from "@/components/CastFilter";
import { CreditRow, CrewRow } from "@/components/CreditRow";
import EpisodeCast from "@/components/EpisodeCast";
import DetailOrder from "@/components/DetailOrder";
import NoteBox from "@/components/NoteBox";
import StatusControls from "@/components/StatusControls";
import MarkRow from "@/components/cast/MarkRow";
import { Where } from "@/components/Where";
import { bylineLabel, DETAIL_LABEL, detailLabel, isCrewId, MAIN_CAST, type CrewId, type DetailId } from "@/lib/details";
import { enrich } from "@/lib/enrich";
import { img, typeLabel } from "@/lib/img";
import { getLibrary, getProfile } from "@/lib/library";
import { getCollection, getTitle, TmdbError } from "@/lib/tmdb";
import type { LibItem, MediaType, Title } from "@/lib/types";

export type TitleParams = Promise<{ type: string; id: string }>;

export async function loadTitle(p: TitleParams) {
  const { type, id } = await p;
  if ((type !== "movie" && type !== "tv") || !/^\d+$/.test(id)) notFound();
  try { return await getTitle(type as MediaType, +id); }
  catch (e) { if (e instanceof TmdbError && e.status === 404) notFound(); throw e; }
}

/** Enriched cast, computed once per request even though both cast sections ask for it. */
const castOf = cache((t: Title, lib: LibItem[]) => enrich(t.people, lib, t.key));

function CrewSection({ id, t }: { id: CrewId; t: Title }) {
  const people = t.crewBy[id];
  if (!people.length) return null;
  return (
    <>
      <h2>{detailLabel(id, t.type)}</h2>
      <div className="card pad"><ul className="credits">{people.map((c) => <CrewRow key={c.id} c={c} />)}</ul></div>
    </>
  );
}

/** The main-cast or rest-of-cast block. `first` adds the compare link, `last` adds the library connections. */
async function CastSection({ part, t, lib, first, last }: { part: "cast_main" | "cast_rest"; t: Title; lib: LibItem[]; first: boolean; last: boolean }) {
  const people = await castOf(t, lib);
  const shown = part === "cast_main" ? people.slice(0, MAIN_CAST) : people.slice(MAIN_CAST);
  const libKeys = Object.fromEntries(lib.map((l) => [l.key, l.status]));
  const links = new Map<string, string[]>();
  for (const c of people) for (const h of c.hits) links.set(h.key, [...(links.get(h.key) ?? []), c.name]);
  const linked = last ? [...links.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8) : [];
  const list = <ul className="credits">{shown.map((c) => <CreditRow key={c.id} c={c} libKeys={libKeys} />)}</ul>;
  return (
    <>
      {shown.length > 0 && (
        <>
          <h2>{DETAIL_LABEL[part]}</h2>
          {first && <p className="small" style={{ margin: "-4px 0 10px" }}><Link href={`/?view=connect&t=${t.key}`}>Compare this cast with another title</Link></p>}
          <div className="card pad">{shown.length > MAIN_CAST ? <CastFilter>{list}</CastFilter> : list}</div>
        </>
      )}
      {linked.length > 0 && (
        <>
          <h2>Connected to your library</h2>
          <div className="card"><ul className="rows">
            {linked.map(([key, names]) => { const l = lib.find((x) => x.key === key)!; return <li key={key}><MarkRow it={l} sub={names.slice(0, 4).join(", ")} small /></li>; })}
          </ul></div>
        </>
      )}
    </>
  );
}

/** Every section the user chose, in the order they chose. Crew is already in hand; cast streams in behind its own spinner. */
function Details({ t, lib, order }: { t: Title; lib: LibItem[]; order: DetailId[] }) {
  const casts = order.filter((i) => i === "cast_main" || i === "cast_rest");
  return (
    <>
      {order.map((id) => id === "cast_main" || id === "cast_rest" ? (
        <Suspense key={id} fallback={<><h2>{DETAIL_LABEL[id]}</h2><p className="muted"><span className="spin" />Finding where you know them from</p></>}>
          <CastSection part={id} t={t} lib={lib} first={id === casts[0]} last={id === casts[casts.length - 1]} />
        </Suspense>
      ) : <CrewSection key={id} id={id} t={t} />)}
    </>
  );
}

async function Related({ t }: { t: Title }) {
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
        {list.map((r) => <li key={r.key}><MarkRow it={r} sub={r.rel} small /></li>)}
      </ul></div>
    </>
  );
}

/** Everything about one title. Shown as the full page, and as the popup over Browse, Library and the rest. */
export default async function TitleView({ t }: { t: Title }) {
  const [lib, profile] = await Promise.all([getLibrary(), getProfile()]);
  const mine = lib.find((l) => l.key === t.key) ?? null;
  const meta = [t.year, typeLabel(t.type), t.runtime ? `${t.runtime} min${t.type === "tv" ? " / ep" : ""}` : "", t.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  // The header credit is whichever crew detail the user ranked highest (Director by default, Composer if they put it first).
  const byline = profile.details.find((id): id is CrewId => isCrewId(id) && t.crewBy[id].length > 0 && id !== "crew_rest");
  return (
    <>
      <div className="sh-top" style={{ marginTop: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {t.poster && <img className="sh-poster" src={img(t.poster, "w342")} alt="" />}
        <div style={{ minWidth: 0 }}>
          <h1 className="sh-title">{t.title}</h1>
          <div className="sh-meta">{meta}</div>
          {byline && <div className="sh-meta">{bylineLabel(byline, t.type)} {t.crewBy[byline].slice(0, 2).map((p) => p.name).join(", ")}</div>}
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
      <DetailOrder initial={profile.details} type={t.type} />
      <Details t={t} lib={lib} order={profile.details} />
      <Suspense fallback={null}><Related t={t} /></Suspense>
      <h2>Notes</h2>
      <NoteBox type={t.type} id={t.id} initial={mine?.note ?? ""} enabled={!!mine} />
    </>
  );
}
