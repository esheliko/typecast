"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLib } from "../cast/LibState";
import { KindSeg } from "../KindSeg";
import { More, Photo, Section, SEEN_STATUS, Sk, Soft, useLimit, useSpans } from "./bits";
import { Timeline, type AxisItem } from "./Timeline";
import { nodeId, useWho, type Node } from "./WhoContext";
import { img } from "@/lib/img";
import { roleLabel } from "@/lib/roster";
import { ofKind, type Kind } from "@/lib/kind";
import { ageAt, fmtMonth, fmtRange, gapBetween, gapChip, lifeLine, readout } from "@/lib/who-dates";
import { whoApi } from "@/lib/who-client";
import { runLabel } from "@/lib/who-spans";
import { posLabel } from "@/lib/who-scope";
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
  const { brief, pos, faces, watched, push, setExact } = useWho();
  const lib = useLib();
  const [data, setData] = useState<PersonData | null>(null);
  const [err, setErr] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
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
  const [override, setOverride] = useState<{ id: string; label: string; range: Range } | null>(null);
  const [focus, setFocus] = useState<string | null>(node.hl ?? null);
  const [hot, setHot] = useState<string | null>(node.hl ?? null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => { setOverride(null); setFocus(node.hl ?? null); setHot(node.hl ?? null); setKind("all"); setOnlySeen(false); setExtras(false); }, [node.id, node.hl]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const credits = useMemo(() => (data?.credits ?? []).filter((c) => c.key !== brief.key), [data, brief.key]);
  const filtered = useMemo(() => {
    let l = credits;
    if (!extras) l = l.filter((c) => !c.extra);
    if (onlySeen) l = l.filter((c) => SEEN_STATUS.has(lib.get(c.key)?.status ?? ""));
    return ofKind(l, kind);
  }, [credits, extras, onlySeen, kind, lib]);

  // Dates to load, on-screen rows first. The show being watched is asked for with the position so its dates stop at where you are.
  const seenFirst = useMemo(() => credits.filter((c) => c.type === "tv" && ["watched", "watching", "partial", "watchlist"].includes(lib.get(c.key)?.status ?? "")).map((c) => c.key), [credits, lib]);
  const [limitHint, setLimitHint] = useState(5);
  const orderedKeys = useMemo(() => {
    const head = filtered.slice(0, limitHint).filter((c) => c.type === "tv").map((c) => c.key);
    const rest = [...filtered.filter((c) => c.type === "tv").map((c) => c.key), ...seenFirst];
    return [...new Set([...(tv ? [brief.key] : []), ...head, ...seenFirst.slice(0, 5), ...rest])];
  }, [filtered, seenFirst, limitHint, tv, brief.key]);
  const cur = tv && pos ? { k: brief.key, pos, cids: face?.cids ?? [] } : null;
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
    return [...base].sort((a, b) => (b.date || b.year).localeCompare(a.date || a.year));
  }, [data, filtered, tv, face, brief, spansEff, ownStart, onlySeen, kind, lib]);

  const lim = useLimit(rows.length, 5);
  useEffect(() => { setLimitHint(lim.shown); }, [lim.shown]);

  const ref = override ?? (watched.range ? { id: "watched", label: watched.label, range: watched.range } : null);
  const whenRow = (c: PCredit) => whenOf(c, spansEff);
  const rangeById = (id: string): { label: string; range: Range } | null => {
    if (id === "watched") return watched.range ? { label: watched.label, range: watched.range } : null;
    const c = rows.find((r) => r.key === id);
    if (!c) return null;
    const w = whenRow(c);
    return w.kind === "range" ? { label: `${c.title}${c.key === brief.key ? ` (up to ${posLabel(pos)})` : ""}`, range: w.range } : null;
  };

  // The default comparison: the row asked about, else the newest row with dates, set against the reference.
  const focusId = focus ?? rows.find((r) => r.key !== ref?.id && whenRow(r).kind === "range" && (whenRow(r) as { own: boolean }).own)?.key ?? null;
  const readoutLine = (() => {
    if (!ref || !focusId || focusId === ref.id) return "";
    const f = rangeById(focusId);
    if (!f) return "";
    return readout(f, { label: ref.label, range: ref.range });
  })();

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
    return [{ id: c.key, start: w.range.start, end: w.range.end, label: `${c.title} ${fmtRange(w.range.start, w.range.end)}${w.own ? "" : " (show's run)"}`, run: !w.own }];
  }), [rows, spansEff]);

  const pick = (id: string) => { setFocus(id); setHot(id); rowRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); if (id && rows.findIndex((r) => r.key === id) >= lim.shown && !lim.all) lim.toggle(); };
  const measure = (c: PCredit) => {
    const w = whenRow(c);
    if (w.kind !== "range") return;
    if (focusId === c.key) setFocus("watched");
    setOverride({ id: c.key, label: `${c.title}${c.key === brief.key ? ` (up to ${posLabel(pos)})` : ""}`, range: w.range });
    setHot(c.key);
  };

  const life = data ? lifeLine(data.birthday, data.deathday, watched.at, watched.atLabel, today) : "";
  const hereLabel = face ? (face.role ? (brief.type === "movie" ? `Plays ${roleLabel(face.role) || face.role} in ${brief.title}` : `${/themselves/i.test(roleLabel(face.role)) ? "" : "Plays "}${roleLabel(face.role)} in ${brief.title}`) : `In ${brief.title}`) : `Not listed in ${brief.title} up to ${posLabel(pos) || "here"}`;

  // "You know them from": what the user has seen of theirs, then what is on their list.
  const known = useMemo(() => {
    const st = (c: PCredit) => lib.get(c.key)?.status;
    const seen = credits.filter((c) => !c.extra && SEEN_STATUS.has(st(c) ?? ""));
    const listed = credits.filter((c) => !c.extra && st(c) === "watchlist");
    return [...seen, ...listed];
  }, [credits, lib]);
  const knownLim = useLimit(known.length, 5);

  return (
    <div className="wx-node wx-person" data-node={nodeId(node)}>
      <header className="wx-phead">
        <button type="button" className="wx-pphoto" onClick={() => data?.photo ? setLightbox(data.photo) : undefined} aria-label={`Enlarge photo of ${node.name}`} disabled={!node.photo && !data?.photo}>
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
                  <button key={p} type="button" className="wx-look" onClick={() => setLightbox(p)} aria-label={`Enlarge another photo of ${node.name}`}>
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
      <Section title="Here" note={tv ? `Episodes of ${brief.title} up to ${posLabel(pos) || "here"}.` : undefined}>
        {!tv ? <p className="small" style={{ margin: 0 }}>{face ? `In this film${face.role ? ` as ${roleLabel(face.role) || face.role}` : ""}.` : "Not in this film's cast."}</p> : <HereEpisodes span={hereSpan} loading={!data || (hereSpan === undefined && !failed)} failed={failed && hereSpan === undefined} regular={face?.part === "main"} inScope={!!face} onSet={setExact} />}
      </Section>

      {/* 3. You know them from */}
      <Section title="You know them from" count={data ? known.length : undefined}>
        {!data && !err && <RowsSk n={2} />}
        {data && !known.length && <p className="small muted" style={{ margin: 0 }}>Nothing in your library or watchlist yet{credits.length ? `, but ${credits.filter((c) => !c.extra).length} other credits on TMDB` : ""}.</p>}
        {data && known.slice(0, knownLim.shown).map((c) => {
          const w = whenRow(c);
          const st = lib.get(c.key)?.status;
          const g = w.kind === "range" && w.own && watched.range ? gapChip(gapBetween(w.range, watched.range)) : "";
          return (
            <button key={c.key} type="button" className="wx-krow" onClick={() => push({ t: "title", key: c.key, title: c.title, year: c.year, poster: c.poster })}>
              <Photo path={c.poster} name={c.title} w="w92" className="wx-kpos" />
              <span className="wx-kmain"><b>{c.title}</b> <span className="muted">{c.year}</span>
                <span className="small muted wx-kline">{[c.role && `as ${roleLabel(c.role) || c.role}`, whenText(c, w)].filter(Boolean).join(" · ")}{w.kind === "loading" && <Sk w={90} h={11} style={{ marginLeft: 4 }} />}</span>
              </span>
              <span className="wx-kright">
                <span className={`ask-st ${st === "watchlist" ? "list" : "seen"}`}>{st === "watchlist" ? "On your list" : "Seen"}</span>
                {g && <span className="wx-gap">{g} this</span>}
              </span>
            </button>
          );
        })}
        {data && <More total={known.length} {...knownLim} />}
      </Section>

      {/* 4. Timeline */}
      <Section title="Timeline" count={data ? rows.length : undefined}>
        <div className="wx-tfilters">
          <KindSeg value={kind} onChange={setKind} label="Films or series" />
          <button type="button" className="chip" aria-pressed={onlySeen} onClick={() => setOnlySeen((v) => !v)}>Only what I&rsquo;ve seen</button>
          <button type="button" className="chip" aria-pressed={extras} onClick={() => setExtras((v) => !v)}>Include talk shows and appearances as themselves</button>
        </div>
        {!data && !err && <><div className="sk-b wx-axis-sk" /><RowsSk n={4} /></>}
        {data && (
          <>
            <Timeline items={axis} refRange={ref?.range ?? null} refLabel={override ? override.label : "Watching"} hot={hot} onPick={pick} />
            <div className="wx-readout" aria-live="polite">
              {readoutLine ? <p>{readoutLine}.</p> : <p className="muted">{ref ? "Tap a bar or a row to compare it." : "TMDB has no air date for what you are watching, so there is nothing to measure from."}</p>}
              {override && <p className="small"><span className="muted">Measuring from </span><b>{override.label}</b> <button type="button" className="linkish" onClick={() => { setOverride(null); setFocus(null); }}>Reset to what you&rsquo;re watching</button></p>}
            </div>
            {!rows.length && <p className="small muted">{credits.length ? "Nothing matches these filters." : "No other credits on TMDB."}</p>}
            <ol className="wx-trows">
              {rows.slice(0, lim.shown).map((c) => <TRow key={c.key} c={c} when={whenRow(c)} birthday={data.birthday} isRef={ref?.id === c.key} refRange={ref?.range ?? null} hot={hot === c.key}
                reg={(el) => { if (el) rowRefs.current.set(c.key, el); else rowRefs.current.delete(c.key); }}
                onOpen={() => push({ t: "title", key: c.key, title: c.title, year: c.year, poster: c.poster })} onMeasure={() => measure(c)} onFocus={() => { setFocus(c.key); setHot(c.key); }}
                isCur={c.key === brief.key} pos={pos} lib={lib.get(c.key)?.status} />)}
            </ol>
            <More total={rows.length} {...lim} />
            {failed && <Soft>Some dates couldn&rsquo;t be loaded. They are left blank, not guessed.</Soft>}
          </>
        )}
      </Section>

      {/* 5. With this cast */}
      <WithCast pid={node.id} name={node.name} />

      {lightbox && <Lightbox path={lightbox} name={node.name} onClose={() => setLightbox(null)} />}
    </div>
  );
}

const RowsSk = ({ n }: { n: number }) => (
  <div className="wx-rowsk" aria-hidden="true">{Array.from({ length: n }, (_, i) => <div key={i} className="wx-krow"><span className="sk-b wx-kpos" /><span className="wx-kmain"><Sk w="55%" h={15} /><Sk w="75%" h={11} style={{ marginTop: 6 }} /></span></div>)}</div>
);

function whenText(c: PCredit, w: When): string {
  if (w.kind !== "range") return w.kind === "none" ? "date unknown" : "";
  if (!w.own) return runLabel(c.title, w.range.start, w.range.end);
  return fmtRange(w.range.start, w.range.end);
}

/** The episodes of the show being watched this person is in (up to where you are), each with "We're on this one". */
function HereEpisodes({ span, loading, failed, regular, inScope, onSet }: { span: Span | null | undefined; loading: boolean; failed: boolean; regular: boolean; inScope: boolean; onSet: (s: number, e: number) => void }) {
  const { pos } = useWho();
  const eps = span?.eps ?? [];
  const lim = useLimit(eps.length, 5);
  if (loading && span === undefined) return <div className="wx-chiprow" aria-hidden="true"><Sk w={150} h={44} /><Sk w={150} h={44} /></div>;
  if (failed) return <Soft>Couldn&rsquo;t load their episodes just now.</Soft>;
  if (!eps.length) return <p className="small muted" style={{ margin: 0 }}>{regular ? "Part of the main cast. TMDB lists no episode dates for them." : inScope ? "TMDB lists no episode dates for them here." : "TMDB doesn’t list them in the episodes up to here."}</p>;
  return (
    <>
      <ul className="wx-chiprow">
        {eps.slice(0, lim.shown).map((x) => {
          const here = pos?.s === x.s && pos?.e === x.e;
          return (
            <li key={`${x.s}-${x.e}`} className="wx-epchip">
              <span><b>S{x.s} E{x.e}</b>, {fmtMonth(x.air)}</span>
              {here ? <span className="wx-here-now">This episode</span> : <button type="button" className="wx-set" onClick={() => onSet(x.s, x.e)}>We&rsquo;re on this one</button>}
            </li>
          );
        })}
      </ul>
      <More total={eps.length} {...lim} />
    </>
  );
}

function TRow({ c, when, birthday, isRef, refRange, hot, reg, onOpen, onMeasure, onFocus, isCur, pos, lib }: {
  c: PCredit; when: When; birthday: string; isRef: boolean; refRange: Range | null; hot: boolean; reg: (el: HTMLElement | null) => void;
  onOpen: () => void; onMeasure: () => void; onFocus: () => void; isCur: boolean; pos: ReturnType<typeof useWho>["pos"]; lib?: string;
}) {
  const range = when.kind === "range" ? when.range : null;
  const own = when.kind === "range" && when.own;
  const age = range && own ? ageAt(birthday, range.start) : null;
  const gap = range && own && refRange && !isRef ? gapChip(gapBetween(range, refRange)) : "";
  return (
    <li ref={reg} className={`wx-trow${hot ? " hot" : ""}${isRef ? " isref" : ""}`} data-key={c.key}>
      <div className="wx-tdates">
        {when.kind === "loading" ? <><Sk w={74} h={13} /><Sk w={54} h={11} style={{ marginTop: 6 }} /></>
          : when.kind === "none" ? <span className="small muted">date unknown</span>
          : own ? <b>{fmtRange(when.range.start, when.range.end)}</b> : <span className="small muted">{runLabel(c.title, when.range.start, when.range.end)}</span>}
        {when.kind === "range" && own && when.range.start.slice(0, 4) && <span className="small muted wx-tyear">{c.type === "tv" && when.range.start !== when.range.end ? "series run" : ""}</span>}
      </div>
      <div className="wx-tmain">
        <button type="button" className="wx-ttitle" onClick={onOpen} onFocus={onFocus}>{c.title}</button>
        <span className="pill">{c.type === "tv" ? "Series" : "Film"}</span>
        {SEEN_STATUS.has(lib ?? "") && <span className="ask-st seen">Seen</span>}
        <div className="small muted wx-trole">{[c.role && `as ${roleLabel(c.role) || c.role}`, isCur ? `up to ${posLabel(pos)}` : "", age != null ? `age ${age}` : ""].filter(Boolean).join(" · ")}</div>
        <div className="wx-tgap">
          {when.kind === "loading" ? <Sk w={96} h={22} style={{ borderRadius: 999 }} /> : gap ? <span className="wx-gap">{gap}</span> : isRef ? <span className="wx-gap ref">Measuring from here</span> : null}
        </div>
      </div>
      <button type="button" className="wx-measure" onClick={onMeasure} disabled={!(when.kind === "range" && own)} aria-pressed={isRef} aria-label={`Measure from ${c.title}`} title="Measure every gap from this row">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Measure</span>
      </button>
    </li>
  );
}

/** Other people in the roster (main cast and this episode's guests) this person shares earlier titles with. Loaded when scrolled into view. */
function WithCast({ pid, name }: { pid: number; name: string }) {
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
  const dateOf = (c: PCredit) => (c.type === "tv" ? (c.date ? `from ${fmtMonth(c.date)}` : "") : fmtMonth(c.date) || c.year);
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
          return (
            <button key={s.id} type="button" className="wx-wrow" onClick={() => push({ t: "pair", a: { id: pid, name, photo: faces.get(pid)?.photo ?? null }, b: { id: f.id, name: f.name, photo: f.photo } })}>
              <Photo path={f.photo} name={f.name} className="wx-wimg" />
              <span className="wx-wmain">
                <b>{f.name}</b> <span className="muted">· {s.total} title{s.total === 1 ? "" : "s"} together</span>
                {s.titles.map((t) => (
                  <span key={t.key} className="small wx-wline"><span className="wx-wt">{t.title}{t.year && ` (${t.year})`}</span>
                    <span className="muted"> · {name.split(" ")[0]} {dateOf(t.a)}, {f.name.split(" ")[0]} {dateOf(t.b)}</span></span>
                ))}
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

function Lightbox({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="wx-lightbox" role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <button ref={btn} type="button" className="back wx-lbx" onClick={onClose}><span aria-hidden="true">&#215;</span> Close</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(path, "w780")} alt={`${name}`} />
    </div>
  );
}
