import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { TitleRow } from "@/components/ui";
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
  const mine = p.known.filter((k) => byKey.has(k.key));
  const rest = p.known.filter((k) => !byKey.has(k.key)).slice(0, 30);
  const rows = (list: typeof p.known) => (
    <div className="card"><ul className="rows">{list.map((k) => <li key={k.key}><TitleRow it={k} lib={byKey.get(k.key)} sub={k.role} small /></li>)}</ul></div>
  );
  return (
    <article className="page">
      <div className="pagebar"><BackButton /></div>
      <div className="sh-top" style={{ marginTop: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.photo && <img className="sh-poster" src={img(p.photo, "w185")} alt="" />}
        <div style={{ minWidth: 0 }}>
          <h1 className="sh-title">{p.name} <GlimpseButton spec={personSpec(p.name, p.dept)} /></h1><div className="sh-meta">{p.dept}</div>
          <Link className="btn sm gold" href={`/?view=connect&a=${p.id}`} style={{ marginTop: 12 }}>Connect with another person</Link>
        </div>
      </div>
      {p.bio && <p className="small muted" style={{ margin: "14px 0 0" }}>{p.bio}{p.bio.length >= 360 ? "…" : ""}</p>}
      {mine.length > 0 && <><h2>In your library</h2>{rows(mine)}</>}
      <h2>Known for</h2>
      {rows(rest)}
    </article>
  );
}
