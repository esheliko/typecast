"use client";
import { useEffect, useMemo, useState } from "react";
import { useLib } from "../cast/LibState";
import QuickMark from "../cast/QuickMark";
import { TitleLink } from "../Modal";
import { More, Photo, Section, Sk, Soft, useLimit, useSpans } from "./bits";
import { nodeId, useWho, type Node } from "./WhoContext";
import { typeLabel } from "@/lib/img";
import { roleLabel } from "@/lib/roster";
import { fmtRange, gapBetween, gapChip, readout } from "@/lib/who-dates";
import { whoApi } from "@/lib/who-client";
import { markLabel, type Item } from "@/lib/types";
import { urlKey } from "@/lib/who-scope";
import type { TitleNode as TitleData } from "@/lib/who-data";

type TNode = Extract<Node, { t: "title" }>;

/** Another title as a node: your mark, where it sits against what you are watching, who from this cast is in it, and its top billed. */
export function TitleNode({ node }: { node: TNode }) {
  const { watched, faces, push } = useWho();
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
  const placed = range?.start && watched.range ? readout({ label: node.title, range }, { label: watched.label, range: watched.range }) : "";

  const fromCast = useMemo(() => (data ? data.cast.filter(([pid]) => faces.has(pid)).map(([pid, role, n]) => ({ f: faces.get(pid)!, role, n })) : []), [data, faces]);
  const lim = useLimit(fromCast.length, 5);

  return (
    <div className="wx-node" data-node={nodeId(node)}>
      <header className="wx-thead">
        <Photo path={node.poster} name={node.title} w="w185" className="wx-tposter" eager />
        <div className="wx-pmeta">
          <h2 className="wx-pname" tabIndex={-1} data-focus-target>{node.title}</h2>
          <p className="small muted" style={{ margin: "2px 0 8px" }}>{[typeLabel(type), data ? (type === "movie" ? fmtRange(data.brief.first, data.brief.first) : range?.start ? fmtRange(range.start, range.end) : node.year) : node.year, data?.brief.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</p>
          <div className="wx-mark-row">
            <QuickMark it={it} variant="inline" />
            <span className="small muted">{m ? markLabel(m.status, m.priority) : "Not marked"}</span>
          </div>
          <TitleLink k={node.key} it={it} className="linkish small wx-full">Open the full page</TitleLink>
        </div>
      </header>

      {err && <Soft>Couldn&rsquo;t load this title just now. <button type="button" className="linkish" onClick={() => { setErr(false); whoApi.title(urlKey(node.key)).then(setData).catch(() => setErr(true)); }}>Try again</button></Soft>}

      <Section title="Against what you're watching">
        {!data && !err ? <Sk w="90%" h={16} /> : placed ? <p className="wx-place">{placed}.</p> : <p className="small muted" style={{ margin: 0 }}>No dates to compare.</p>}
      </Section>

      <Section title="From this cast" count={data ? fromCast.length : undefined} note="People in what you are watching (up to where you are) who are also in this title.">
        {!data && !err && <div className="wx-rowsk" aria-hidden="true"><Sk w="80%" h={44} /><Sk w="70%" h={44} style={{ marginTop: 8 }} /></div>}
        {data && !fromCast.length && <p className="small muted" style={{ margin: 0 }}>No one from the cast here is in this title.</p>}
        {fromCast.slice(0, lim.shown).map(({ f, role }) => (
          <CastRow key={f.id} f={f} role={role} titleKey={node.key} type={type} release={data?.brief.first ?? ""}
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
function CastRow({ f, role, titleKey, type, release, onOpen }: { f: { id: number; name: string; photo: string | null }; role: string; titleKey: string; type: "movie" | "tv"; release: string; onOpen: () => void }) {
  const { watched } = useWho();
  const { spans } = useSpans(f.id, type === "tv" ? [titleKey] : [], null);
  const s = spans[titleKey];
  const range = type === "movie" ? (release ? { start: release, end: release } : null) : s && s.kind === "own" ? { start: s.start, end: s.end } : null;
  const loading = type === "tv" && s === undefined;
  return (
    <button type="button" className="wx-wrow" onClick={onOpen}>
      <Photo path={f.photo} name={f.name} className="wx-wimg" />
      <span className="wx-wmain"><b>{f.name}</b>
        <span className="small muted wx-wline">{role ? `as ${roleLabel(role) || role}` : " "}</span>
        <span className="small wx-wline">{loading ? <Sk w={110} h={12} /> : range ? <><b>{fmtRange(range.start, range.end)}</b>{watched.range && <span className="wx-gap" style={{ marginLeft: 8 }}>{gapChip(gapBetween(range, watched.range))}</span>}</> : <span className="muted">{s?.kind === "run" ? "during the show's run" : "date unknown"}</span>}</span>
      </span>
      <span className="wx-go" aria-hidden="true">›</span>
    </button>
  );
}
