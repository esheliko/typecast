import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import PersonCredits from "@/components/cast/CreditList";
import { GlimpseButton } from "@/components/Glimpse";
import { personSpec } from "@/lib/glimpse";
import { img } from "@/lib/img";
import { getLibrary } from "@/lib/library";
import { getPerson, TmdbError } from "@/lib/tmdb";

type Props = { params: Promise<{ id: string }> };

async function load(p: Props["params"]) {
  const { id } = await p;
  if (!/^\d+$/.test(id)) notFound();
  try { return await getPerson(+id); }
  catch (e) { if (e instanceof TmdbError && e.status === 404) notFound(); throw e; }
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try { return { title: (await load(params)).name }; } catch { return { title: "Person" }; }
}

export default async function PersonPage({ params }: Props) {
  const p = await load(params);
  const lib = await getLibrary();
  const byKey = new Map(lib.map((l) => [l.key, l]));
  const mineKeys = p.known.filter((k) => byKey.has(k.key)).map((k) => k.key);
  return (
    <article className="page">
      <div className="pagebar"><BackButton /></div>
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
    </article>
  );
}
