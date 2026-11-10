"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLib } from "../cast/LibState";
import { KindSeg } from "../KindSeg";
import { More, Photo, Section, SEEN_STATUS, Sk, Soft, useLimit, useSpans } from "./bits";
import { Timeline, type AxisItem } from "./Timeline";
import { defaultChoice, readoutChoice } from "@/lib/who-readout";
import { nodeId, useWho, type Node } from "./WhoContext";
import { img } from "@/lib/img";
import { roleLabel } from "@/lib/roster";
import { ofKind, type Kind } from "@/lib/kind";
import { ageAt, fmtMonth, fmtRange, gapBetween, gapChip, lifeLine, readout } from "@/lib/who-dates";
import { pairLabels } from "@/lib/who-common";
import { whoApi } from "@/lib/who-client";
import { showRunLabel } from "@/lib/who-spans";
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
  // The readout compares the reference only with a row somebody chose on purpose: a click (selected), or a hover/focus (preview).
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => { setOverride(null); setSelected(null); setPreview(null); setKind("all"); setOnlySeen(false); setExtras(false); }, [node.id, node.hl]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
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

  const lim = useLimit(rows.length, 8);
  useEffect(() => { setLimitHint(lim.shown); }, [lim.shown]);

  const ref = override ?? (watched.range ? { id: "watched", label: watched.label, range: watched.range } : null);
  const whenRow = (c: PCredit) => whenOf(c, spansEff);
  const rangeById = (id: string): { label: string; range: Range; approx: boolean } | null => {
    if (id === "watched") return watched.range ? { label: watched.label, range: watched.range, approx: false } : null;
    const c = rows.find((r) => r.key === id);
    if (!c) return null;
    const w = whenRow(c);
    return w.kind === "range" ? { label: `${c.title}${c.key === brief.key ? ` (up to ${posLabel(pos)})` : ""}`, range: w.range, approx: !w.own } : null;
  };

  // Default choice on open: the title picked from "titles in common", else the top "You know them from" title, else nothing.
  const usable = (id: string) => {
    if (ref && id === ref.id) return false;
    const c = rows.find((r) => r.key === id);
    return !!c && whenRow(c).kind !== "none";
  };
  const fallback = defaultChoice({ highlighted: node.hl, known: known.map((c) => c.key), usable });
  const chosen = readoutChoice({ preview, selected, fallback, usable });
  const readoutLine = (() => {
    if (!ref || !chosen) return "";
    const f = rangeById(chosen);
    return f ? readout(f, { label: ref.label, range: ref.range }) : "";
  })();
  const hot = chosen;
  const marked = selected && usable(selected) ? selected : fallback;

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
    return [{ id: c.key, start: w.range.start, end: w.range.end, label: `${c.title} ${w.own ? fmtRange(w.range.start, w.range.end) : showRunLabel(w.range.start, w.range.end)}`, run: !w.own, seen: SEEN_STATUS.has(lib.get(c.key)?.status ?? "") }];
  }), [rows, spansEff, lib]);

  const pick = (id: string) => {
    setSelected(id);
    if (rows.findIndex((r) => r.key === id) >= lim.shown && !lim.all) lim.toggle();
    // After the row has rendered (it may have just been revealed).
    setTimeout(() => rowRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);
  };
  const measure = (c: PCredit) => {
    const w = whenRow(c);
    if (w.kind !== "range") return;
    if (selected === c.key) setSelected(null);
    setOverride({ id: c.key, label: `${c.title}${c.key === brief.key ? ` (up to ${posLabel(pos)})` : ""}`, range: w.range });
  };

  const life = data ? lifeLine(data.birthday, data.deathday, watched.at, watched.atLabel, today) : "";
  const hereLabel = face ? (face.role ? (brief.type === "movie" ? `Plays ${roleLabel(face.role) || face.role} in ${brief.title}` : `${/themselves/i.test(roleLabel(face.role)) ? "" : "Plays "}${roleLabel(face.role)} in ${brief.title}`) : `In ${brief.title}`) : `Not listed in ${brief.title} up to ${posLabel(pos) || "here"}`;

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
          const g = w.kind === "range" && watched.range ? gapChip(gapBetween(w.range, watched.range), !w.own) : "";
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
            <Timeline items={axis} refRange={ref?.range ?? null} refLabel={override ? override.label : "Watching"} selected={marked} hot={preview} onPick={pick} onPreview={setPreview} />
            <div className="wx-readout" aria-live="polite">
              {readoutLine && <p>{readoutLine}.</p>}
              {!ref && <p className="small muted">TMDB has no air date for what you are watching, so there is nothing to measure from.</p>}
              {override && <p className="small"><span className="muted">Measuring from </span><b>{override.label}</b> <button type="button" className="linkish" onClick={() => { setOverride(null); setSelected(null); }}>Reset to what you&rsquo;re watching</button></p>}
            </div>
            {!rows.length && <p className="small muted">{credits.length ? "Nothing matches these filters." : "No other credits on TMDB."}</p>}
            <ol className="wx-trows">
              {rows.slice(0, lim.shown).map((c) => <TRow key={c.key} c={c} when={whenRow(c)} birthday={data.birthday} isRef={ref?.id === c.key} refRange={ref?.range ?? null} hot={hot === c.key}
                reg={(el) => { if (el) rowRefs.current.set(c.key, el); else rowRefs.current.delete(c.key); }}
                onOpen={() => push({ t: "title", key: c.key, title: c.title, year: c.year, poster: c.poster })} onMeasure={() => measure(c)} onSelect={() => pick(c.key)} onPreview={(on) => setPreview(on ? c.key : null)}
                isCur={c.key === brief.key} pos={pos} lib={lib.get(c.key)?.status} />)}
            </ol>
            <More total={rows.length} {...lim} />
            {failed && <Soft>Some dates couldn&rsquo;t be loaded. They are left blank, not guessed.</Soft>}
          </>
        )}
      </Section>

      {/* 5. With this cast */}
      <WithCast pid={node.id} name={node.name} g={data?.g ?? faces.get(node.id)?.g ?? 0} />

      {lightbox && <Lightbox path={lightbox} name={node.name} onClose={() => setLightbox(null)} />}
    </div>
  );
}

const RowsSk = ({ n }: { n: number }) => (
  <div className="wx-rowsk" aria-hidden="true">{Array.from({ length: n }, (_, i) => <div key={i} className="wx-krow"><span className="sk-b wx-kpos" /><span className="wx-kmain"><Sk w="55%" h={15} /><Sk w="75%" h={11} style={{ marginTop: 6 }} /></span></div>)}</div>
);

function whenText(c: PCredit, w: When): string {
  if (w.kind !== "range") return w.kind === "none" ? "date unknown" : "";
  if (!w.own) return showRunLabel(w.range.start, w.range.end);
  return fmtRange(w.range.start, w.range.end);
}

/** The episodes of the show being watched this person is in (up to where you are). Each chip is itself the button; only the one set now is gold. */
function HereEpisodes({ span, loading, failed, regular, inScope, onSet }: { span: Span | null | undefined; loading: boolean; failed: boolean; regular: boolean; inScope: boolean; onSet: (s: number, e: number) => void }) {
  const { pos } = useWho();
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
                : <button type="button" className="wx-epchip" onClick={() => onSet(x.s, x.e)} title={`Set ${name} as where we are`} aria-label={`Set ${name} as where we are`}><b>{name}</b>{x.air ? ` · ${fmtMonth(x.air)}` : ""}</button>}
            </li>
          );
        })}
      </ul>
      <More total={eps.length} {...lim} />
    </>
  );
}

function TRow({ c, when, birthday, isRef, refRange, hot, reg, onOpen, onMeasure, onSelect, onPreview, isCur, pos, lib }: {
  c: PCredit; when: When; birthday: string; isRef: boolean; refRange: Range | null; hot: boolean; reg: (el: HTMLElement | null) => void;
  onOpen: () => void; onMeasure: () => void; onSelect: () => void; onPreview: (on: boolean) => void; isCur: boolean; pos: ReturnType<typeof useWho>["pos"]; lib?: string;
}) {
  const range = when.kind === "range" ? when.range : null;
  const own = when.kind === "range" && when.own;
  const age = range && own ? ageAt(birthday, range.start) : null;
  const gap = range && refRange && !isRef ? gapChip(gapBetween(range, refRange), !own) : "";
  const seen = SEEN_STATUS.has(lib ?? "");
  const role = [c.role && `as ${roleLabel(c.role) || c.role}`, isCur ? `up to ${posLabel(pos)}` : "", age != null ? `age ${age}` : ""].filter(Boolean).join(" · ");
  return (
    <li ref={reg} className={`wx-trow${hot ? " hot" : ""}${isRef ? " isref" : ""}`} data-key={c.key}
      onMouseEnter={() => onPreview(true)} onMouseLeave={() => onPreview(false)} onFocus={() => onPreview(true)} onBlur={() => onPreview(false)}
      onClick={(ev) => { if (!(ev.target as HTMLElement).closest("button")) onSelect(); }}>
      {when.kind === "loading" ? <span className="wx-tdates"><Sk w={74} h={13} /></span>
        : <button type="button" className="wx-tdates" onClick={onSelect} disabled={when.kind === "none"} aria-label={`Compare ${c.title} with what you are watching`}>
          {when.kind === "none" ? <span className="muted">date unknown</span> : own ? <b>{fmtRange(when.range.start, when.range.end)}</b> : <span className="muted">{showRunLabel(when.range.start, when.range.end)}</span>}
        </button>}
      <span className="wx-tline">
        <button type="button" className="wx-ttitle" onClick={onOpen}>{c.title}</button>
        <span className="pill wx-kind">{c.type === "tv" ? "Series" : "Film"}</span>
        {seen && <span className="ask-st seen" title="You have seen this">&#10003; Seen</span>}
      </span>
      <span className="small muted wx-trole" title={role}>{role}</span>
      <span className="wx-tgap">
        {when.kind === "loading" ? <Sk w={90} h={22} style={{ borderRadius: 999 }} /> : gap ? <span className="wx-gap">{gap}</span> : isRef ? <span className="wx-gap ref">Reference</span> : null}
      </span>
      <button type="button" className="wx-measure" onClick={onMeasure} disabled={when.kind !== "range"} aria-pressed={isRef} aria-label={`Measure from ${c.title}`} title={isRef ? "Measuring every gap from this row" : "Measure every gap from this row"}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
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
                <b>{f.name}</b> <span className="muted">· {s.total} title{s.total === 1 ? "" : "s"} together</span>
                {s.titles.slice(0, 2).map((t) => (
                  <span key={t.key} className="small wx-wline"><span className="wx-wt">{t.title}</span>
                    <span className="muted"> · {la} {yearOf(t.a)} · {lb} {yearOf(t.b)}</span></span>
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
