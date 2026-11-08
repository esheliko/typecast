import Link from "next/link";
import { notFound } from "next/navigation";
import PersonCredits from "@/components/cast/CreditList";
import { GlimpseButton } from "@/components/Glimpse";
import { personSpec } from "@/lib/glimpse";
import { img } from "@/lib/img";
import { getLibrary } from "@/lib/library";
import { getPerson, TmdbError } from "@/lib/tmdb";

export type PersonParams = Promise<{ id: string }>;

export async function loadPerson(p: PersonParams) {
  const { id } = await p;
  if (!/^\d+$/.test(id)) notFound();
  try { return await getPerson(+id); }
  catch (e) { if (e instanceof TmdbError && e.status === 404) notFound(); throw e; }
}

/** The person's page body, shared by the full page and the popup (like TitleView). */
export default async function PersonView({ p }: { p: Awaited<ReturnType<typeof loadPerson>> }) {
  const lib = await getLibrary();
  const byKey = new Map(lib.map((l) => [l.key, l]));
  const mineKeys = p.known.filter((k) => byKey.has(k.key)).map((k) => k.key);
  return (
    <>
      <div className="sh-top" style={{ marginTop: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.photo && <img className="sh-poster" src={img(p.photo, "w185")} alt="" />}
        <div style={{ minWidth: 0 }}>
          <h1 className="sh-title">{p.name} <GlimpseButton spec={personSpec(p.name, p.dept)} /> {p.imdbId && <a className="imdb-link" href={`https://www.imdb.com/name/${p.imdbId}/`} target="_blank" rel="noopener noreferrer" aria-label="Open on IMDb" title="Open on IMDb">IMDb ↗</a>}</h1><div className="sh-meta">{p.dept}</div>
          <Link className="btn sm gold" href={`/?view=connect&a=${p.id}`} style={{ marginTop: 12 }}>Connect with another person</Link>
        </div>
      </div>
      {p.bio && <p className="small muted" style={{ margin: "14px 0 0" }}>{p.bio}{p.bio.length >= 360 ? "…" : ""}</p>}
      <PersonCredits known={p.known} mineKeys={mineKeys} />
    </>
  );
}
