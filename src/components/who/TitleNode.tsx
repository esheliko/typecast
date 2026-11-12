"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useLib } from "../cast/LibState";
import QuickMark from "../cast/QuickMark";
import { TitleLink } from "../Modal";
import { GlimpseButton } from "../Glimpse";
import { castSpec, scopeSpec, withLibRoles } from "@/lib/glimpse";
import { More, Photo, Section, Sk, Soft, useLimit, useSpans, ZoomBtn } from "./bits";
import { nodeId, useWho, type Node } from "./WhoContext";
import { typeLabel } from "@/lib/img";
import { roleLabel } from "@/lib/roster";
import { fmtRange } from "@/lib/who-dates";
import { fmtDate } from "@/lib/episodes";
import { whoApi } from "@/lib/who-client";
import { markLabel, type Item } from "@/lib/types";
import { urlKey } from "@/lib/who-scope";
import type { GlimpseSpec } from "@/lib/glimpse";
import type { TitleNode as TitleData } from "@/lib/who-data";

type TNode = Extract<Node, { t: "title" }>;

// Header dates show years only (no release month).
const yr = (d: string | null | undefined) => (d ?? "").slice(0, 4);
const years = (a: string, b: string) => (yr(a) && yr(b) && yr(a) !== yr(b) ? `${yr(a)}-${yr(b)}` : yr(a));

/** Another title as a node: your mark, a short description, who from this cast is in it, and its top billed. */
export function TitleNode({ node }: { node: TNode }) {
  const { faces, push, brief: cur, spoilers, clip } = useWho();
  // The show being watched: its end date and later episodes would give things away, so only its start year is shown.
  const self = node.key === cur.key;
  const lib = useLib();
  const [data, setData] = useState<TitleData | null>(null);
  const [err, setErr] = useState(false);
  const type = node.key.startsWith("tv:") ? "tv" : "movie";
  const id = Number(node.key.slice(node.key.indexOf(":") + 1));
  useEffect(() => {
    let live = true;
    setData(null); setErr(false);
    whoApi.title(urlKey(node.key)).then((d) => { if (live) setData(d); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [node.key]);

  const it: Item = { key: node.key, type, id, title: node.title, year: node.year, poster: node.poster };
  const m = lib.get(node.key);
  const range = data ? { start: data.brief.first, end: data.brief.last || data.brief.first } : null;

  const fromCast = useMemo(() => (data ? data.cast.filter(([pid]) => faces.has(pid)).map(([pid, role, n]) => ({ f: faces.get(pid)!, role, n })) : []), [data, faces]);
  const lim = useLimit(fromCast.length, 5);
  const spec = (name: string, role: string, pid: number) => scopeSpec(withLibRoles(castSpec(name, role, { title: node.title, year: node.year, type, key: node.key }, "Acting", pid), name), { key: cur.key, title: cur.title, clip, spoilers });

  return (
    <div className="wx-node" data-node={nodeId(node)}>
      <header className="wx-thead">
        <ZoomBtn path={node.poster} name={node.title} className="wx-tposterb"><Photo path={node.poster} name={node.title} w="w185" className="wx-tposter" eager /></ZoomBtn>
        <div className="wx-pmeta">
          <h2 className="wx-pname" tabIndex={-1} data-focus-target>{node.title}</h2>
          <p className="small muted" style={{ margin: "2px 0 8px" }}>{[typeLabel(type), <span key="y" title={data ? fmtDate(data.brief.first) || undefined : undefined}>{data ? (type === "movie" || self ? yr(data.brief.first) || node.year : range?.start ? years(range.start, range.end) : node.year) : node.year}</span>, data?.brief.genres.slice(0, 2).join(", ")].filter((x) => x && (typeof x !== "object" || x.props.children)).map((x, i) => <Fragment key={i}>{i ? " · " : null}{x}</Fragment>)}</p>
          <div className="wx-mark-row">
            <QuickMark it={it} variant="inline" />
            <span className="small muted">{m ? markLabel(m.status, m.priority) : "Not marked"}</span>
          </div>
          <TitleLink k={node.key} it={it} className="linkish small wx-full">Open the full page</TitleLink>
        </div>
      </header>

      {err && <Soft>Couldn&rsquo;t load this title just now. <button type="button" className="linkish" onClick={() => { setErr(false); whoApi.title(urlKey(node.key)).then(setData).catch(() => setErr(true)); }}>Try again</button></Soft>}

      <Section title="About">
        {!data && !err ? <Sk w="90%" h={16} /> : data?.brief.overview ? <p className="wx-place">{data.brief.overview}</p> : <p className="small muted" style={{ margin: 0 }}>No description available.</p>}
      </Section>

      <Section title="From this cast" count={data ? fromCast.length : undefined} note={spoilers ? "People from the whole series you are watching who are also in this title." : "People in what you are watching (up to where you are) who are also in this title."}>
        {!data && !err && <div className="wx-rowsk" aria-hidden="true"><Sk w="80%" h={44} /><Sk w="70%" h={44} style={{ marginTop: 8 }} /></div>}
        {data && !fromCast.length && <p className="small muted" style={{ margin: 0 }}>No one from the cast here is in this title.</p>}
        {fromCast.slice(0, lim.shown).map(({ f, role }) => (
          <CastRow key={f.id} f={f} role={role} spec={spec(f.name, role, f.id)} titleKey={node.key} type={type} release={data?.brief.first ?? ""} hideDates={self}
            onOpen={() => push({ t: "person", id: f.id, name: f.name, photo: f.photo, hl: node.key })} />
        ))}
        {data && <More total={fromCast.length} {...lim} />}
      </Section>

      <Section title="Top billed">
        {!data && !err && <div className="wx-topgrid" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} className="sk-b wx-topsk" />)}</div>}
        {data && (
          <ul className="wx-topgrid">
            {data.top.map((p) => (
              <li key={p.id}>
                <button type="button" className="wx-billed" onClick={() => push({ t: "person", id: p.id, name: p.name, photo: p.photo })}>
                  <Photo path={p.photo} name={p.name} className="wx-ph" />
                  <b>{p.name}</b><span className="small muted wx-role">{roleLabel(p.role) || " "}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** One person of the watched cast within another title: their part, their own dates there, and the gap to what you are watching. */
function CastRow({ f, role, spec, titleKey, type, release, hideDates, onOpen }: { f: { id: number; name: string; photo: string | null }; role: string; spec: GlimpseSpec; titleKey: string; type: "movie" | "tv"; release: string; hideDates?: boolean; onOpen: () => void }) {
  const { spans } = useSpans(f.id, type === "tv" && !hideDates ? [titleKey] : [], null);
  const s = spans[titleKey];
  const range = type === "movie" ? (release ? { start: release, end: release } : null) : s && s.kind === "own" ? { start: s.start, end: s.end } : null;
  const loading = type === "tv" && !hideDates && s === undefined;
  return (
    <div className="wx-wrowx">
    <button type="button" className="wx-wrow" onClick={onOpen}>
      <Photo path={f.photo} name={f.name} className="wx-wimg" />
      <span className="wx-wmain"><b>{f.name}</b>
        <span className="small muted wx-wline">{role ? `as ${roleLabel(role) || role}` : " "}</span>
        <span className="small wx-wline">{hideDates ? null : loading ? <Sk w={110} h={12} /> : range ? <><b>{fmtRange(range.start, range.end)}</b></> : <span className="muted">{s?.kind === "run" ? "during the show's run" : "date unknown"}</span>}</span>
      </span>
      <span className="wx-go" aria-hidden="true">›</span>
    </button>
    <span className="wx-wg"><GlimpseButton spec={spec} label={`About ${f.name}${role ? ` as ${roleLabel(role) || role}` : ""}: the character, episodes and images`} /></span>
    </div>
  );
}
