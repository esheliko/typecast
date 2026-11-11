"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLib } from "../cast/LibState";
import { KindSeg } from "../KindSeg";
import { GlimpseButton } from "../Glimpse";
import { More, Photo, Section, SEEN_STATUS, Sk, Soft, useLimit, useSpans } from "./bits";
import { Timeline, type AxisItem } from "./Timeline";
import { defaultChoice } from "@/lib/who-readout";
import { rankByRecognition } from "@/lib/who-known";
import { nodeId, useWho, type Node } from "./WhoContext";
import { img } from "@/lib/img";
import { roleLabel } from "@/lib/roster";
import { ofKind, type Kind } from "@/lib/kind";
import { fmtMonth, fmtRange, lifeLine, yearsLabel } from "@/lib/who-dates";
import { pairLabels } from "@/lib/who-common";
import { whoApi } from "@/lib/who-client";
import { showRunLabel } from "@/lib/who-spans";
import { posCode, posLabel, scopeKind } from "@/lib/who-scope";
import { creditSpec, scopeSpec } from "@/lib/glimpse";
import type { PCredit, PersonData, Range, Span } from "@/lib/who-types";
import type { SharedBrief } from "@/lib/who-data";

type PNode = Extract<Node, { t: "person" }>;

/** A row's dates: a film's release, a series' own first-to-last episode (or the show's run when TMDB has no list), loading, or unknown. */
type When = { kind: "loading" } | { kind: "none" } | { kind: "range"; range: Range; own: boolean };

function whenOf(c: PCredit, spans: Record<string, Span | null>): When {
  if (c.type === "movie") return c.date ? { kind: "range", range: { start: c.date, end: c.date }, own: true } : { kind: "none" };
  const s = spans[c.key];
  if (s === undefined) return { kind: "loading" };
  if (!s) return { kind: "none" };
  return { kind: "range", range: { start: s.start, end: s.end }, own: s.kind === "own" };
}

/** Everything about one person, in one scroll column: no tabs. */
export function PersonNode({ node }: { node: PNode }) {
  const { brief, today, pos, clip, spoilers, faces, watched, push, zoom } = useWho();
  const lib = useLib();
  const [data, setData] = useState<PersonData | null>(null);
  const [err, setErr] = useState(false);
  const face = faces.get(node.id);
  const tv = brief.type === "tv";

  useEffect(() => {
    let live = true;
    setData(null); setErr(false);
    whoApi.person(node.id).then((d) => { if (live) setData(d); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [node.id]);

  // Timeline controls.
  const [kind, setKind] = useState<Kind>("all");
  const [onlySeen, setOnlySeen] = useState(false);
  const [extras, setExtras] = useState(false);
  // The row somebody chose on purpose: a click (selected), or a hover/focus (preview). The default is the title you came from (a title in the trail, or one picked from "titles in common"), else the top "You know them from" title.
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const tlSec = useRef<HTMLElement>(null);
  const tlSticky = useRef<HTMLDivElement>(null);
  // The rows scroll under the sticky timeline: tell their scroll-margin how tall it is.
  useEffect(() => {
    const el = tlSticky.current, sec = tlSec.current;
    if (!el || !sec || typeof ResizeObserver === "undefined") return;
    const set = () => sec.style.setProperty("--wx-tl-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);
  useEffect(() => { setSelected(null); setPreview(null); setKind("all"); setOnlySeen(false); setExtras(false); }, [node.id, node.hl]);

  const credits = useMemo(() => (data?.credits ?? []).filter((c) => c.key !== brief.key), [data, brief.key]);
  // "You know them from": what the user has seen of theirs, then what is on their list.
  const known = useMemo(() => {
    const st = (c: PCredit) => lib.get(c.key)?.status;
    const seen = credits.filter((c) => !c.extra && SEEN_STATUS.has(st(c) ?? ""));
    const listed = credits.filter((c) => !c.extra && st(c) === "watchlist");
    return [...seen, ...listed];
  }, [credits, lib]);
  const filtered = useMemo(() => {
    let l = credits;
    if (!extras) l = l.filter((c) => !c.extra);
    if (onlySeen) l = l.filter((c) => SEEN_STATUS.has(lib.get(c.key)?.status ?? ""));
    return ofKind(l, kind);
  }, [credits, extras, onlySeen, kind, lib]);

  // Dates to load, on-screen rows first. The show being watched is asked for with the position so its dates stop at where you are.
  const seenFirst = useMemo(() => credits.filter((c) => c.type === "tv" && ["watched", "watching", "partial", "watchlist"].includes(lib.get(c.key)?.status ?? "")).map((c) => c.key), [credits, lib]);
  const [limitHint, setLimitHint] = useState(8);
  const orderedKeys = useMemo(() => {
    const head = filtered.slice(0, limitHint).filter((c) => c.type === "tv").map((c) => c.key);
    const rest = [...filtered.filter((c) => c.type === "tv").map((c) => c.key), ...seenFirst];
    return [...new Set([...(tv ? [brief.key] : []), ...head, ...seenFirst.slice(0, 5), ...rest])];
  }, [filtered, seenFirst, limitHint, tv, brief.key]);
  const cur = tv && clip ? { k: brief.key, pos: clip, cids: face?.cids ?? [] } : null;
  const { spans, failed } = useSpans(node.id, data ? orderedKeys : [], cur);
  const hereSpan = tv ? spans[brief.key] : undefined;
  // A regular has no episode list on TMDB: their own first credited air date up to where you are is still true, and nothing later is shown.
  const ownStart = data?.credits.find((c) => c.key === brief.key)?.date ?? "";
  const spansEff = useMemo(() => {
    if (!(tv && face?.part === "main" && hereSpan === null && ownStart && watched.range)) return spans;
    const end = watched.range.end >= ownStart ? watched.range.end : ownStart;
    return { ...spans, [brief.key]: { key: brief.key, kind: "own" as const, start: ownStart, end, n: 0, eps: [] } };
  }, [spans, tv, face?.part, hereSpan, ownStart, watched.range, brief.key]);

  // The row for the show being watched: only what has aired up to the position.
  const rows = useMemo(() => {
    if (!data) return [];
    const own: PCredit | null = tv && face ? {
      key: brief.key, type: "tv", id: brief.id, title: brief.title, year: brief.year, poster: brief.poster, role: face.role, date: spansEff[brief.key]?.start ?? ownStart, eps: face.n, cids: face.cids, extra: false, votes: 0,
    } : null;
    const base = own && !(onlySeen && !SEEN_STATUS.has(lib.get(brief.key)?.status ?? "")) && (kind === "all" || kind === "tv") && spansEff[brief.key] !== null ? [own, ...filtered] : filtered;
    // Most recognisable first (part, fame of the title, what you have seen), not by date: the axis above still shows the dates.
    return rankByRecognition(base, (k) => lib.get(k), tv && face ? brief.key : undefined);
  }, [data, filtered, tv, face, brief, spansEff, ownStart, onlySeen, kind, lib]);

  const lim = useLimit(rows.length, 8);
  useEffect(() => { setLimitHint(lim.shown); }, [lim.shown]);

  const ref = watched.range ? { id: "watched", label: watched.label, range: watched.range } : null;
  const whenRow = (c: PCredit) => whenOf(c, spansEff);
  // Default choice on open: the title picked from "titles in common", else the top "You know them from" title, else nothing.
  const usable = (id: string) => {
    if (ref && id === ref.id) return false;
    const c = rows.find((r) => r.key === id);
    return !!c && whenRow(c).kind !== "none";
  };
  const fallback = defaultChoice({ highlighted: node.hl, known: known.map((c) => c.key), usable });
  const marked = selected && usable(selected) ? selected : fallback;
  // The selected row is always on screen: when it is below the first rows, it follows them after a "…" gap, in its ranked place.
  const markedIdx = marked ? rows.findIndex((r) => r.key === marked) : -1;
  const pinned = !lim.all && markedIdx >= lim.shown;
  const visibleRows = pinned ? [...rows.slice(0, lim.shown), rows[markedIdx]] : rows.slice(0, lim.shown);

  // Opened from "titles in common": bring that row into view once its place is known.
  useEffect(() => {
    if (!node.hl || !data) return;
    const i = rows.findIndex((r) => r.key === node.hl);
    if (i >= lim.shown && !lim.all) lim.toggle();
    const t = setTimeout(() => rowRefs.current.get(node.hl!)?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.hl, data]);

  const axis: AxisItem[] = useMemo(() => rows.flatMap((c): AxisItem[] => {
    const w = whenOf(c, spansEff);
    if (w.kind !== "range") return [];
    const now = tv && c.key === brief.key;
    const dates = w.own ? fmtRange(w.range.start, w.range.end) : showRunLabel(w.range.start, w.range.end);
    return [{ id: c.key, start: w.range.start, end: w.range.end, label: `${c.title} ${dates}${now && clip ? `, so far (up to ${posCode(clip)})` : ""}`, run: !w.own, seen: SEEN_STATUS.has(lib.get(c.key)?.status ?? ""), now, sofar: now && !!clip, solo: now }];
  }), [rows, spansEff, lib, tv, brief.key, clip]);

  const pick = (id: string) => {
    setSelected(id);
    if (rows.findIndex((r) => r.key === id) >= lim.shown && !lim.all) lim.toggle();
    // After the row has rendered (it may have just been revealed).
    setTimeout(() => rowRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);
  };
  const life = data ? lifeLine(data.birthday, data.deathday, watched.at, watched.atLabel, today) : "";
  const hereLabel = face ? (face.role ? (brief.type === "movie" ? `Plays ${roleLabel(face.role) || face.role} in ${brief.title}` : `${/themselves/i.test(roleLabel(face.role)) ? "" : "Plays "}${roleLabel(face.role)} in ${brief.title}`) : `In ${brief.title}`) : clip ? `Not listed in ${brief.title} up to ${posLabel(pos) || "here"}` : `Not listed in ${brief.title}`;

  const knownLim = useLimit(known.length, 5);

  return (
    <div className="wx-node wx-person" data-node={nodeId(node)}>
      <header className="wx-phead">
        <button type="button" className="wx-pphoto" onClick={() => { const ph = data?.photo ?? node.photo; if (ph) zoom({ path: ph, name: node.name }); }} aria-label={`Enlarge photo of ${node.name}`} disabled={!node.photo && !data?.photo}>
          <Photo path={node.photo ?? data?.photo ?? null} name={node.name} w="w342" className="wx-pimg" eager />
        </button>
        <div className="wx-pmeta">
          <h2 className="wx-pname" tabIndex={-1} data-focus-target>{node.name}</h2>
          {data ? (life && <p className="wx-life">{life}</p>) : <Sk w="75%" h={14} style={{ margin: "4px 0 6px" }} />}
          <p className="wx-here small">{hereLabel}</p>
          {data && data.images.length > 0 && (
            <div className="wx-looks" aria-label="Other looks">
              <span className="mc-label">Other looks</span>
              <div className="wx-looks-row">
                {data.images.map((p) => (
                  <button key={p} type="button" className="wx-look" onClick={() => zoom({ path: p, name: node.name })} aria-label={`Enlarge another photo of ${node.name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img(p, "w185")} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {!data && !err && <div className="wx-looks-row" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className="sk-b wx-look" />)}</div>}
        </div>
      </header>

      {err && <Soft>Couldn&rsquo;t load {node.name}&rsquo;s credits. <button type="button" className="linkish" onClick={() => { setErr(false); whoApi.person(node.id).then(setData).catch(() => setErr(true)); }}>Try again</button></Soft>}

      {/* 2. Here */}
      <Section title="Here" note={tv ? (clip ? `Episodes of ${brief.title} up to ${posLabel(pos) || "here"}.` : `Episodes of ${brief.title}.`) : undefined}>
        {!tv ? <p className="small" style={{ margin: 0 }}>{face ? `In this film${face.role ? ` as ${roleLabel(face.role) || face.role}` : ""}.` : "Not in this film's cast."}</p> : <HereEpisodes span={hereSpan} loading={!data || (hereSpan === undefined && !failed)} failed={failed && hereSpan === undefined} regular={face?.part === "main"} inScope={!!face} />}
      </Section>

      {/* 3. You know them from */}
      <Section title="You know them from" count={data ? known.length : undefined}>
        {!data && !err && <RowsSk n={2} />}
        {data && !known.length && <p className="small muted" style={{ margin: 0 }}>Nothing in your library or watchlist yet{credits.length ? `, but ${credits.filter((c) => !c.extra).length} other credits on TMDB` : ""}.</p>}
        {data && known.slice(0, knownLim.shown).map((c) => {
          const w = whenRow(c);
          const st = lib.get(c.key)?.status;
          const n = epsIn(c, spansEff[c.key]);
          return (
            <div key={c.key} className="wx-krow">
              <button type="button" className="wx-kbtn" onClick={() => push({ t: "title", key: c.key, title: c.title, year: c.year, poster: c.poster })}>
                <Photo path={c.poster} name={c.title} w="w92" className="wx-kpos" />
                <span className="wx-kmain"><b>{c.title}</b> <span className="muted">{c.type === "tv" ? yearsLabel(c.year, spansEff[c.key]?.show) : c.year}</span>
                  <span className="small muted wx-kline">{[c.role && `as ${roleLabel(c.role) || c.role}`, whenText(c, w), n ? epsLabel(n) : ""].filter(Boolean).join(" · ")}{w.kind === "loading" && <Sk w={90} h={11} style={{ marginLeft: 4 }} />}</span>
                </span>
                <span className="wx-kright">
                  <span className={`ask-st ${st === "watchlist" ? "list" : "seen"}`}>{st === "watchlist" ? "On your list" : "Seen"}</span>
                </span>
              </button>
              <GlimpseButton spec={scopeSpec(creditSpec(node.name, c.role, { title: c.title, year: c.year, type: c.type, key: c.key }, node.id), { key: brief.key, title: brief.title, clip, spoilers })} label={`About ${node.name}${c.role ? ` as ${roleLabel(c.role) || c.role}` : ""} in ${c.title}: the role, episodes and images`} />
            </div>
          );
        })}
        {data && <More total={known.length} {...knownLim} />}
      </Section>

      {/* 4. Timeline: its header, filters and the axis stay in view while the titles scroll under them */}
      <section className="wx-sec wx-tlsec" aria-label="Timeline" ref={tlSec}>
        <div className="wx-tsticky" ref={tlSticky}>
          <div className="wx-tfilters">
            <h3 className="wx-h wx-tlh">Timeline{data && <span className="muted"> · {rows.length}</span>}</h3>
            <KindSeg value={kind} onChange={setKind} label="Films or series" />
            <button type="button" className="chip" aria-pressed={onlySeen} onClick={() => setOnlySeen((v) => !v)}>Only what I&rsquo;ve seen</button>
            <button type="button" className="chip" aria-pressed={extras} onClick={() => setExtras((v) => !v)}>Talk shows &amp; self</button>
          </div>
          {!data && !err && <div className="sk-b wx-axis-sk" />}
          {data && (
            <>
              <Timeline items={axis} refRange={ref?.range ?? null} refLabel="Watching" refSoFar={tv && scopeKind(pos) === "season" && !!clip} selected={marked} hot={preview} onPick={pick} onPreview={setPreview} />
            </>
          )}
        </div>
        {!data && !err && <RowsSk n={4} />}
        {data && (
          <>
            {!rows.length && <p className="small muted">{credits.length ? "Nothing matches these filters." : "No other credits on TMDB."}</p>}
            <ol className="wx-trows">
              {visibleRows.map((c, i) => (
                <Fragment key={c.key}>
                  {pinned && i === visibleRows.length - 1 && <li className="wx-gaprow" aria-hidden="true">&hellip;</li>}
                  <TRow c={c} actor={node.name} actorId={node.id} when={whenRow(c)} eps={epsIn(c, spansEff[c.key])} sel={marked === c.key} hot={preview === c.key}
                    reg={(el) => { if (el) rowRefs.current.set(c.key, el); else rowRefs.current.delete(c.key); }}
                    onOpen={() => push({ t: "title", key: c.key, title: c.title, year: c.year, poster: c.poster })} onSelect={() => pick(c.key)} onPreview={(on) => setPreview(on ? c.key : null)}
                    isCur={c.key === brief.key} upTo={clip ? posLabel(clip) : ""} lib={lib.get(c.key)?.status} />
                </Fragment>
              ))}
            </ol>
            <More total={rows.length} {...lim} />
            {failed && <Soft>Some dates couldn&rsquo;t be loaded. They are left blank, not guessed.</Soft>}
          </>
        )}
      </section>

      {/* 5. With this cast */}
      <WithCast pid={node.id} name={node.name} g={data?.g ?? faces.get(node.id)?.g ?? 0} />

    </div>
  );
}

const RowsSk = ({ n }: { n: number }) => (
  <div className="wx-rowsk" aria-hidden="true">{Array.from({ length: n }, (_, i) => <div key={i} className="wx-krow"><span className="sk-b wx-kpos" /><span className="wx-kmain"><Sk w="55%" h={15} /><Sk w="75%" h={11} style={{ marginTop: 6 }} /></span></div>)}</div>
);

/** How many episodes they were in: TMDB's count on the credit, or what their own episode list adds up to. */
function epsIn(c: PCredit, s: Span | null | undefined): number {
  return c.type === "tv" ? Math.max(c.eps, s?.n ?? 0) : 0;
}
const epsLabel = (n: number) => `${n} episode${n === 1 ? "" : "s"}`;

function whenText(c: PCredit, w: When): string {
  if (w.kind !== "range") return w.kind === "none" ? "date unknown" : "";
  if (!w.own) return showRunLabel(w.range.start, w.range.end);
  return fmtRange(w.range.start, w.range.end);
}

/** The episodes of the show being watched this person is in (up to where you are). Each chip opens that episode as the next step of the trail and never moves where you are; only the one you are on is gold. */
function HereEpisodes({ span, loading, failed, regular, inScope }: { span: Span | null | undefined; loading: boolean; failed: boolean; regular: boolean; inScope: boolean }) {
  const { pos, push } = useWho();
  const eps = span?.eps ?? [];
  const lim = useLimit(eps.length, 8);
  if (loading && span === undefined) return <div className="wx-chiprow" aria-hidden="true"><Sk w={120} h={44} /><Sk w={120} h={44} /></div>;
  if (failed) return <Soft>Couldn&rsquo;t load their episodes just now.</Soft>;
  if (!eps.length) return <p className="small muted" style={{ margin: 0 }}>{regular ? "Part of the main cast. TMDB lists no episode dates for them." : inScope ? "TMDB lists no episode dates for them here." : "TMDB doesn’t list them in the episodes up to here."}</p>;
  return (
    <>
      <ul className="wx-chiprow">
        {eps.slice(0, lim.shown).map((x) => {
          const here = pos?.s === x.s && pos?.e === x.e;
          const name = `S${x.s} E${x.e}`;
          return (
            <li key={`${x.s}-${x.e}`}>
              {here
                ? <span className="wx-epchip here" aria-current="true"><b>{name}</b> · You are here</span>
                : <button type="button" className="wx-epchip" onClick={() => push({ t: "episode", s: x.s, e: x.e })} title={`Open ${name}`} aria-label={`Open ${name}`}><b>{name}</b>{x.air ? ` · ${fmtMonth(x.air)}` : ""}</button>}
            </li>
          );
        })}
      </ul>
      <More total={eps.length} {...lim} />
    </>
  );
}

function TRow({ c, actor, actorId, when, eps, sel, hot, reg, onOpen, onSelect, onPreview, isCur, upTo, lib }: {
  c: PCredit; actor: string; actorId: number; when: When; eps: number; sel: boolean; hot: boolean; reg: (el: HTMLElement | null) => void;
  onOpen: () => void; onSelect: () => void; onPreview: (on: boolean) => void; isCur: boolean; upTo: string; lib?: string;
}) {
  const { brief, clip, spoilers } = useWho();
  const own = when.kind === "range" && when.own;
  const seen = SEEN_STATUS.has(lib ?? "");
  const role = [c.role && `as ${roleLabel(c.role) || c.role}`, isCur && upTo ? `up to ${upTo}` : "", eps ? epsLabel(eps) : ""].filter(Boolean).join(" · ");
  return (
    <li ref={reg} className={`wx-trow${sel ? " sel" : ""}${hot ? " hot" : ""}`} data-key={c.key}
      onMouseEnter={() => onPreview(true)} onMouseLeave={() => onPreview(false)} onFocus={() => onPreview(true)} onBlur={() => onPreview(false)}
      onClick={(ev) => { if (!(ev.target as HTMLElement).closest("button")) onSelect(); }}>
      {when.kind === "loading" ? <span className="wx-tdates"><Sk w={74} h={13} /></span>
        : <button type="button" className="wx-tdates" onClick={onSelect} disabled={when.kind === "none"} aria-label={`Compare ${c.title} with what you are watching`}>
          {when.kind === "none" ? <span className="muted">date unknown</span> : own ? <b>{fmtRange(when.range.start, when.range.end).replace(/ /g, "\u00a0").replace("-", "-\u200b")}</b> : <span className="muted">{showRunLabel(when.range.start, when.range.end)}</span>}
        </button>}
      <span className="wx-tline">
        <button type="button" className="wx-ttitle" onClick={onOpen}>{c.title}</button>
        <span className="pill wx-kind">{c.type === "tv" ? "Series" : "Film"}</span>
        {seen && <span className="ask-st seen" title="You have seen this">&#10003; Seen</span>}
      </span>
      <span className="small muted wx-trole" title={role}>{role}</span>
      <span className="wx-tgl"><GlimpseButton spec={scopeSpec(creditSpec(actor, c.role, { title: c.title, year: c.year, type: c.type, key: c.key }, actorId), { key: brief.key, title: brief.title, clip, spoilers })} label={`About ${actor}${c.role ? ` as ${roleLabel(c.role) || c.role}` : ""} in ${c.title}: the role, episodes and images`} /></span>
    </li>
  );
}

/** Other people in the roster (main cast and this episode's guests) this person shares earlier titles with. Loaded when scrolled into view. */
function WithCast({ pid, name, g }: { pid: number; name: string; g: number }) {
  const { brief, faces, push } = useWho();
  const [list, setList] = useState<SharedBrief[] | null>(null);
  const [err, setErr] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const cands = useMemo(() => {
    const all = [...faces.values()].filter((f) => f.id !== pid);
    const rank = (f: { part: string }) => (f.part === "main" ? 0 : f.part === "episode" ? 1 : 2);
    return all.sort((a, b) => rank(a) - rank(b)).filter((f) => f.part === "main" || f.part === "episode" || f.part === "guest").slice(0, 30);
  }, [faces, pid]);
  const ids = cands.map((f) => f.id);
  useEffect(() => { setSeen(false); setList(null); setErr(false); }, [pid]);
  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    // Not on screen yet: start anyway after the rest has settled, so it is ready by the time you scroll to it.
    const t = setTimeout(() => setSeen(true), 2500);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [seen, pid]);
  useEffect(() => {
    if (!seen || !ids.length) return;
    let live = true;
    whoApi.shared(pid, ids, brief.key).then((r) => { if (live) setList(r.shared); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [seen, pid, brief.key, ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const lim = useLimit(list?.length ?? 0, 5);
  const yearOf = (c: PCredit) => c.date.slice(0, 4) || c.year;
  return (
    <Section title="With this cast" count={list ? list.length : undefined} note={`People in ${brief.title}'s cast who share earlier titles with ${name}.`}>
      <div ref={box}>
        {!ids.length && <p className="small muted" style={{ margin: 0 }}>No one else is listed in this cast.</p>}
        {ids.length > 0 && !list && !err && <RowsSk n={3} />}
        {err && <Soft>Couldn&rsquo;t compare with the rest of the cast just now.</Soft>}
        {list && !list.length && <p className="small muted" style={{ margin: 0 }}>No other titles in common with the rest of this cast.</p>}
        {list?.slice(0, lim.shown).map((s) => {
          const f = faces.get(s.id);
          if (!f) return null;
          const [la, lb] = pairLabels({ name, g }, { name: f.name, g: f.g });
          return (
            <button key={s.id} type="button" className="wx-wrow" onClick={() => push({ t: "pair", a: { id: pid, name, photo: faces.get(pid)?.photo ?? null }, b: { id: f.id, name: f.name, photo: f.photo } })}>
              <Photo path={f.photo} name={f.name} className="wx-wimg" />
              <span className="wx-wmain">
                <span className="wx-wline"><b>{f.name}</b><span className="muted">&nbsp;· {s.total} title{s.total === 1 ? "" : "s"} together</span></span>
                {s.titles.slice(0, 2).map((t) => (
                  <span key={t.key} className="small wx-wline"><span className="wx-wt">{t.title}</span>
                    <span className="muted">&nbsp;· {la} {yearOf(t.a)} · {lb} {yearOf(t.b)}</span></span>
                ))}
                {s.total > 2 && <span className="small muted wx-wline">+{s.total - 2} more</span>}
              </span>
              <span className="wx-go" aria-hidden="true">›</span>
            </button>
          );
        })}
        {list && <More total={list.length} {...lim} />}
      </div>
    </Section>
  );
}
