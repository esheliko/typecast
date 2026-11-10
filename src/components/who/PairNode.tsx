"use client";
import { useEffect, useMemo, useState } from "react";
import { More, Photo, Section, Sk, Soft, useLimit, useSpans } from "./bits";
import { nodeId, useWho, type Node } from "./WhoContext";
import { roleLabel } from "@/lib/roster";
import { fmtMonth, fmtRange } from "@/lib/who-dates";
import { whoApi } from "@/lib/who-client";
import { runLabel } from "@/lib/who-spans";
import type { Shared } from "@/lib/who-common";
import type { PCredit, Span } from "@/lib/who-types";

type PNode = Extract<Node, { t: "pair" }>;

/** Everything two people were both in, newest first, each with both people's own dates. */
export function PairNode({ node }: { node: PNode }) {
  const { brief, pos, faces, push } = useWho();
  const [titles, setTitles] = useState<Shared[] | null>(null);
  const [err, setErr] = useState(false);
  const [extras, setExtras] = useState(false);
  useEffect(() => {
    let live = true;
    setTitles(null); setErr(false);
    whoApi.pair(node.a.id, node.b.id).then((r) => { if (live) setTitles(r.titles); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [node.a.id, node.b.id]);

  // The show being watched is a title they share too: its dates stop at your position, like everywhere else.
  const rows = useMemo(() => (titles ?? []).filter((t) => extras || (!t.a.extra && !t.b.extra)), [titles, extras]);
  const lim = useLimit(rows.length, 5);
  const keys = useMemo(() => rows.filter((t) => t.type === "tv").map((t) => t.key), [rows]);
  const ordered = useMemo(() => [...keys.slice(0, lim.shown + 2), ...keys.slice(lim.shown + 2)], [keys, lim.shown]);
  const curFor = (id: number) => (brief.type === "tv" && pos ? { k: brief.key, pos, cids: faces.get(id)?.cids ?? [] } : null);
  const A = useSpans(node.a.id, titles ? ordered : [], curFor(node.a.id));
  const B = useSpans(node.b.id, titles ? ordered : [], curFor(node.b.id));
  const first = (n: string) => n.split(" ")[0];

  const when = (c: PCredit, spans: Record<string, Span | null>, who: number): React.ReactNode => {
    if (c.type === "movie") return c.date ? <b>{fmtMonth(c.date)}</b> : <span className="muted">date unknown</span>;
    const s = spans[c.key];
    if (s === undefined) return <Sk w={90} h={12} />;
    if (!s) return <span className="muted">{c.key === brief.key ? (who && faces.get(who)?.part === "main" ? "main cast, up to here" : "not listed up to here") : "date unknown"}</span>;
    return s.kind === "own" ? <b>{fmtRange(s.start, s.end)}</b> : <span className="muted">{runLabel(c.title, s.start, s.end)}</span>;
  };

  return (
    <div className="wx-node" data-node={nodeId(node)}>
      <header className="wx-pairhead">
        {[node.a, node.b].map((p, i) => (
          <button key={p.id} type="button" className="wx-pairp" onClick={() => push({ t: "person", id: p.id, name: p.name, photo: p.photo })} aria-label={`Open ${p.name}`}>
            <Photo path={p.photo} name={p.name} w="w185" className="wx-pimg" eager />
            {i === 0 ? <h2 className="wx-pname" tabIndex={-1} data-focus-target>{p.name}</h2> : <b className="wx-pname2">{p.name}</b>}
          </button>
        ))}
        <span className="wx-amp" aria-hidden="true">&amp;</span>
      </header>
      <Section title="In both" count={titles ? rows.length : undefined} note="Titles they were both in, newest first, with each person's own dates.">
        <div className="wx-tfilters"><button type="button" className="chip" aria-pressed={extras} onClick={() => setExtras((v) => !v)}>Include talk shows and appearances as themselves</button></div>
        {!titles && !err && <div className="wx-rowsk" aria-hidden="true">{[0, 1, 2].map((i) => <Sk key={i} w="85%" h={56} style={{ marginBottom: 8 }} />)}</div>}
        {err && <Soft>Couldn&rsquo;t compare them just now.</Soft>}
        {titles && !rows.length && <p className="small muted" style={{ margin: 0 }}>{titles.length ? "Only talk shows and appearances as themselves." : "No other title in common."}</p>}
        <ol className="wx-trows">
          {rows.slice(0, lim.shown).map((t) => (
            <li key={t.key} className="wx-pairrow">
              <button type="button" className="wx-ttitle" onClick={() => push({ t: "title", key: t.key, title: t.title, year: t.year, poster: t.a.poster })}>{t.title}</button>
              <span className="pill">{t.type === "tv" ? "Series" : "Film"}</span>{t.key === brief.key && <span className="small muted"> · up to where you are</span>}
              <div className="wx-pairline"><span className="wx-pairwho">{first(node.a.name)}</span><span className="small muted">{t.a.role ? `as ${roleLabel(t.a.role) || t.a.role}` : ""}</span><span className="wx-pairwhen">{when(t.a, A.spans, node.a.id)}</span></div>
              <div className="wx-pairline"><span className="wx-pairwho">{first(node.b.name)}</span><span className="small muted">{t.b.role ? `as ${roleLabel(t.b.role) || t.b.role}` : ""}</span><span className="wx-pairwhen">{when(t.b, B.spans, node.b.id)}</span></div>
            </li>
          ))}
        </ol>
        <More total={rows.length} {...lim} />
      </Section>
    </div>
  );
}
