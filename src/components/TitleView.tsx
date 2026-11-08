import Link from "next/link";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import { AwardChips, AwardsSection } from "@/components/Awards";
import CastFilter from "@/components/CastFilter";
import { CreditRow, CrewRow } from "@/components/CreditRow";
import EpisodeCast from "@/components/EpisodeCast";
import DetailOrder from "@/components/DetailOrder";
import NoteBox from "@/components/NoteBox";
import StatusControls from "@/components/StatusControls";
import RelatedButton from "@/components/cast/RelatedButton";
import { GlimpseButton } from "@/components/Glimpse";
import { titleSpec } from "@/lib/glimpse";
import MarkRow from "@/components/cast/MarkRow";
import { LinkedRows } from "@/components/cast/CreditList";
import { FromProvider } from "@/components/Modal";
import { Where } from "@/components/Where";
import { fillCrew, missingCrew } from "@/lib/crew-fill";
import { bylineLabel, DETAIL_IDS, DETAIL_LABEL, detailLabel, isCrewId, MAIN_CAST, type CrewBy, type CrewId, type DetailId } from "@/lib/details";
import { enrich } from "@/lib/enrich";
import { img, typeLabel } from "@/lib/img";
import { getLibrary, getProfile } from "@/lib/library";
import TitleFranchise from "@/components/cast/TitleFranchise";
import { getFranchise, getTitle, TmdbError } from "@/lib/tmdb";
import type { EnrichedMember, Item, LibItem, MediaType, Title } from "@/lib/types";

export type TitleParams = Promise<{ type: string; id: string }>;

export async function loadTitle(p: TitleParams) {
  const { type, id } = await p;
  if ((type !== "movie" && type !== "tv") || !/^\d+$/.test(id)) notFound();
  try { return await getTitle(type as MediaType, +id); }
  catch (e) { if (e instanceof TmdbError && e.status === 404) notFound(); throw e; }
}

/** Enriched cast, computed once per request even though both cast sections ask for it. */
const castOf = cache((t: Title, lib: LibItem[]) => enrich(t.people, lib, t.key));

/** Consecutive crew details share one card; each category is a small label beside its people, not a header of its own. */
function CrewSection({ ids, t }: { ids: CrewId[]; t: Title }) {
  const groups = ids.filter((id) => t.crewBy[id].length);
  if (!groups.length) return null;
  return (
    <>
      <h2>Crew</h2>
      <div className="card pad crew-card">
        {groups.map((id) => (
          <div key={id} className="crew-group">
            <div className="crew-label">{detailLabel(id, t.type)}</div>
            <ul className="credits">{t.crewBy[id].map((c) => <CrewRow key={c.id} c={c} />)}</ul>
          </div>
        ))}
      </div>
    </>
  );
}

type CastProps = { part: "cast_main" | "cast_rest"; t: Title; lib: LibItem[]; first: boolean; last: boolean };

/** The main-cast or rest-of-cast block. `first` adds the compare link, `last` adds the library connections. While `pending`, the people are shown without their extras. */
function CastBlock({ part, t, lib, people, first, last, pending }: CastProps & { people: EnrichedMember[]; pending?: boolean }) {
  const shown = part === "cast_main" ? people.slice(0, MAIN_CAST) : people.slice(MAIN_CAST);
  const libKeys = Object.fromEntries(lib.map((l) => [l.key, l.status]));
  const links = new Map<string, string[]>();
  for (const c of people) for (const h of c.hits) links.set(h.key, [...(links.get(h.key) ?? []), c.name]);
  const linked = last ? [...links.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8) : [];
  const list = <ul className="credits">{shown.map((c) => <CreditRow key={c.id} c={c} libKeys={libKeys} pending={pending} title={{ title: t.title, year: t.year, type: t.type }} />)}</ul>;
  return (
    <>
      {shown.length > 0 && (
        <>
          <h2>{DETAIL_LABEL[part]}</h2>
          {first && <p className="small" style={{ margin: "-4px 0 10px" }}><Link href={`/?view=connect&t=${t.key}`}>Compare this cast with another title</Link></p>}
          <div className={`card pad${part === "cast_main" ? " cast-main" : ""}`}>{shown.length > MAIN_CAST ? <CastFilter>{list}</CastFilter> : list}</div>
        </>
      )}
      {pending && last && shown.length > 0 && <p className="muted small" style={{ marginTop: 14 }}><span className="spin" />Finding where you know them from</p>}
      {linked.length > 0 && (
        <details className="cw" style={{ marginTop: 18 }}>
          <summary>Connections to your library<span className="cw-n">{linked.length}</span></summary>
          <p className="small" style={{ margin: "4px 0 10px" }}>Titles in your library that share cast with {t.title}.</p>
          <LinkedRows items={linked.map(([key, names]) => {
            const l = lib.find((x) => x.key === key)!;
            const more = names.length > 4 ? ` +${names.length - 4} more` : "";
            return { ...l, sub: `Shared cast: ${names.slice(0, 4).join(", ")}${more}` };
          })} />
        </details>
      )}
    </>
  );
}

/** The same block once everyone's other credits are in. */
async function CastSection(props: CastProps) {
  return <CastBlock {...props} people={await castOf(props.t, props.lib)} />;
}

/** Every section the user chose, in the order they chose. Crew is already in hand; cast streams in behind its own spinner. */
function Details({ t, lib, order }: { t: Title; lib: LibItem[]; order: DetailId[] }) {
  const casts = order.filter((i) => i === "cast_main" || i === "cast_rest");
  // Merge runs of adjacent crew details into one block.
  const blocks: (DetailId | CrewId[])[] = [];
  for (const id of order) {
    const last = blocks[blocks.length - 1];
    if (isCrewId(id) && Array.isArray(last)) last.push(id);
    else blocks.push(isCrewId(id) ? [id] : id);
  }
  return (
    <>
      {blocks.map((id) => Array.isArray(id) ? (
        <Suspense key={id[0]} fallback={<CrewSection ids={id} t={t} />}><FilledCrew ids={id} t={t} /></Suspense>
      ) : id === "cast_main" || id === "cast_rest" ? (
        // The cast is already known from the title itself, so show it right away; "you know them from" fills in behind it.
        <Suspense key={id} fallback={<CastBlock part={id} t={t} lib={lib} first={id === casts[0]} last={id === casts[casts.length - 1]} pending
          people={t.people.map((c) => ({ ...c, hits: [], also: [], top: [] }))} />}>
          <CastSection part={id} t={t} lib={lib} first={id === casts[0]} last={id === casts[casts.length - 1]} />
        </Suspense>
      ) : null)}
    </>
  );
}

/** Details switched off in Setup stay one tap away, folded under a single collapsed section. */
function Unchosen({ t, lib, order }: { t: Title; lib: LibItem[]; order: DetailId[] }) {
  const rest = DETAIL_IDS.filter((id) => !order.includes(id));
  if (!rest.length) return null;
  return (
    <details className="cw" style={{ marginTop: 22 }}>
      <summary>More details<span className="cw-n">{rest.length}</span></summary>
      <Details t={t} lib={lib} order={rest} />
    </details>
  );
}

/** The rest of the collection / universe with one-tap marks. Opens by itself once this title is marked as seen. */
async function Franchise({ t }: { t: Title }) {
  const groups = await getFranchise(t.type, t.id).catch(() => []);
  return groups.length ? <TitleFranchise groups={groups} titleKey={t.key} /> : null;
}

async function Related({ t, origin }: { t: Title; origin?: Item | null }) {
  const have = new Set((await getFranchise(t.type, t.id).catch(() => [])).flatMap((g) => g.items.map((i) => i.key)));
  const list: (Item & { rel?: string })[] = t.related.filter((r) => !have.has(r.key));
  // The title this popup was opened from is listed first, like the rest, unless the franchise list already shows it.
  if (origin && origin.key !== t.key && !have.has(origin.key)) {
    const i = list.findIndex((r) => r.key === origin.key);
    list.unshift(i >= 0 ? list.splice(i, 1)[0] : { ...origin, rel: "Opened from" });
  }
  if (!list.length) return null;
  return (
    <>
      <details className="cw" style={{ marginTop: 22 }}>
        <summary>Related<span className="cw-n">{list.length}</span></summary>
        <div className="card"><ul className="rows">
          {list.map((r) => <li key={r.key}><MarkRow it={r} sub={r.rel} small /></li>)}
        </ul></div>
      </details>
    </>
  );
}

/** Header credits: the top-ranked crew detail, plus the composer. Same output for TMDB's data and for the Wikidata-filled version. */
function Bylines({ t, crewBy, details }: { t: Title; crewBy: CrewBy; details: DetailId[] }) {
  const byline = details.find((id): id is CrewId => isCrewId(id) && crewBy[id].length > 0 && id !== "crew_rest");
  // Music is always worth a line, even when the Composer detail isn't switched on in Setup.
  const music = byline !== "composer" ? crewBy.composer.slice(0, 2).map((p) => p.name).join(", ") : "";
  return (
    <>
      {byline && <div className="sh-meta">{bylineLabel(byline, t.type)} {crewBy[byline].slice(0, 2).map((p) => p.name).join(", ")}</div>}
      {music && <div className="sh-meta">{bylineLabel("composer", t.type)} {music}</div>}
    </>
  );
}
/** TMDB's credits show at once; the gaps fill in from Wikidata behind them. */
async function FilledBylines({ t, details }: { t: Title; details: DetailId[] }) {
  return <Bylines t={t} crewBy={await fillCrew(t.type, t.imdbId, t.crewBy)} details={details} />;
}
async function FilledCrew({ ids, t }: { ids: CrewId[]; t: Title }) {
  return <CrewSection ids={ids} t={{ ...t, crewBy: await fillCrew(t.type, t.imdbId, t.crewBy) }} />;
}

/** Everything about one title. Shown as the full page, and as the popup over Browse, Library and the rest. */
export default async function TitleView({ t, origin }: { t: Title; origin?: Item | null }) {
  const [lib, profile] = await Promise.all([getLibrary(), getProfile()]);
  const mine = lib.find((l) => l.key === t.key) ?? null;
  const meta = [t.year, typeLabel(t.type), t.runtime ? `${t.runtime} min${t.type === "tv" ? " / ep" : ""}` : "", t.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  const gaps = missingCrew(t.crewBy).length > 0 && !!t.imdbId;
  return (
    <FromProvider k={t.key} name={t.title}>
      <div className="sh-top sh-compact" style={{ marginTop: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {t.poster && <img className="sh-poster" src={img(t.poster, "w185")} alt="" />}
        <div style={{ minWidth: 0 }}>
          <h1 className="sh-title">{t.title} <RelatedButton it={t} /> <GlimpseButton spec={titleSpec(t)} /> {t.imdbId && <a className="imdb-link" href={`https://www.imdb.com/title/${t.imdbId}/`} target="_blank" rel="noopener noreferrer" aria-label="Open on IMDb" title="Open on IMDb">IMDb ↗</a>}</h1>
          <div className="sh-meta">{meta}</div>
          <Suspense fallback={null}><AwardChips t={t} /></Suspense>
          {gaps
            ? <Suspense fallback={<Bylines t={t} crewBy={t.crewBy} details={profile.details} />}><FilledBylines t={t} details={profile.details} /></Suspense>
            : <Bylines t={t} crewBy={t.crewBy} details={profile.details} />}
          {t.overview && <details className="sh-ov"><summary>{t.overview}</summary><p>{t.overview}</p></details>}
        </div>
      </div>
      <StatusControls item={t} lib={mine} />
      {t.type === "tv" && t.seasons.length > 0 && (
        <details className="sh-ep">
          <summary>Episode cast</summary>
          <EpisodeCast tvId={t.id} seasons={t.seasons} initial={mine?.progress ?? { s: t.seasons[0].n, e: 1 }} inLibrary={!!mine} />
        </details>
      )}
      <Where t={t} profile={profile} />
      <DetailOrder initial={profile.details} type={t.type} />
      <Details t={t} lib={lib} order={profile.details} />
      <Unchosen t={t} lib={lib} order={profile.details} />
      <Suspense fallback={null}><AwardsSection t={t} /></Suspense>
      <Suspense fallback={null}><Franchise t={t} /></Suspense>
      <Suspense fallback={null}><Related t={t} origin={origin} /></Suspense>
      <h2>Notes</h2>
      <NoteBox type={t.type} id={t.id} initial={mine?.note ?? ""} enabled={!!mine} />
    </FromProvider>
  );
}
