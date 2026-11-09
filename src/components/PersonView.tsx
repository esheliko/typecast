import Link from "next/link";
import { notFound } from "next/navigation";
import PersonCredits from "@/components/cast/CreditList";
import { PersonProvider } from "@/components/Modal";
import { GlimpseButton } from "@/components/Glimpse";
import { personInTitleSpec } from "@/lib/glimpse";
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
export default async function PersonView({ p, from }: { p: Awaited<ReturnType<typeof loadPerson>>; from?: { key: string; name: string; year?: string } }) {
  const lib = await getLibrary();
  const byKey = new Map(lib.map((l) => [l.key, l]));
  const mineKeys = p.known.filter((k) => byKey.has(k.key)).map((k) => k.key);
  return (
    <>
      <div className="sh-top" style={{ marginTop: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.photo && <img className="sh-poster" src={img(p.photo, "w185")} alt="" />}
        <div style={{ minWidth: 0 }}>
          <h1 className="sh-title">{p.name} <GlimpseButton spec={personInTitleSpec(p.name, p.dept, from && { title: from.name, year: from.year, type: from.key.startsWith("tv") ? "tv" : "movie" })} /> {p.imdbId && <a className="imdb-link" href={`https://www.imdb.com/name/${p.imdbId}/`} target="_blank" rel="noopener noreferrer" aria-label="Open on IMDb" title="Open on IMDb">IMDb ↗</a>}</h1><div className="sh-meta">{p.dept}</div>
          <Link className="btn sm gold" href={`/?view=connect&a=${p.id}`} style={{ marginTop: 12 }}>Connect with another person</Link>
        </div>
      </div>
      {p.bio && <p className="small muted" style={{ margin: "14px 0 0" }}>{p.bio}{p.bio.length >= 360 ? "…" : ""}</p>}
      <PersonProvider id={p.id}><PersonCredits known={p.known} mineKeys={mineKeys} /></PersonProvider>
    </>
  );
}

/** The title a person's page was opened from (?pf=movie:603&pn=…&py=…), if the query is well formed. */
export function fromTitle(q: { pf?: string; pn?: string; py?: string }) {
  return q.pf && /^(movie|tv):\d+$/.test(q.pf) && q.pn ? { key: q.pf, name: q.pn.slice(0, 200), year: q.py && /^\d{4}$/.test(q.py) ? q.py : undefined } : undefined;
}
