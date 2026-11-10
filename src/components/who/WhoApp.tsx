"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWatchControl } from "../Watching";
import { Finder } from "./Finder";
import { PairNode } from "./PairNode";
import { PersonNode } from "./PersonNode";
import { PositionControl } from "./PositionControl";
import { RootNode } from "./RootNode";
import { TitleNode } from "./TitleNode";
import { EpisodeNode } from "./EpisodeNode";
import { Dock, Trail } from "./Trail";
import { Lightbox, Photo, ZoomBtn } from "./bits";
import { nodeId, WhoProvider, type Node, type Watched } from "./WhoContext";
import { lockScroll } from "@/lib/scroll-lock";
import { day } from "@/lib/who-dates";
import { posKey, readRecent, saveRecent, whoApi, type RecentTrail } from "@/lib/who-client";
import { posCode, posLabel, scopeKind, urlKey } from "@/lib/who-scope";
import { currentNode, emptyTrail, jumpTo, pushNode, startTrail } from "@/lib/who-trail";
import type { WhoBrief } from "@/lib/who-data";
import type { Pos, WhoRoster } from "@/lib/who-types";

const SPOIL_KEY = "typecast.ask.spoilers";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };
const bid = () => Math.random().toString(36).slice(2, 9);

/** The /who page: top bar, the finder (left) and the node you opened (right), joined by a trail. Position lives in the watch cookie when there is a watch, else the URL. */
export function WhoApp({ brief, initialPos, today }: { brief: WhoBrief; initialPos: Pos | null; today: string }) {
  const router = useRouter();
  const wc = useWatchControl();
  const tv = brief.type === "tv";
  const [pos, setPos] = useState<Pos | null>(tv ? initialPos ?? { s: null, e: null } : null);
  const [roster, setRoster] = useState<WhoRoster | null>(null);
  const [rosterErr, setRosterErr] = useState(false);
  const [retry, setRetry] = useState(0);
  const [trail, setTrail] = useState(() => emptyTrail(bid()));
  /** Phones: whether the details cover the finder. (Wide screens always show them.) */
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<RecentTrail[]>([]);
  const [zoomed, setZoomed] = useState<{ path: string; name: string; size?: string } | null>(null);
  /** The page-wide spoiler switch: true = spoilers allowed. Off (the default) keeps everything inside where you are. */
  const [spoilers, setSpoilers] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const reqId = useRef(0);

  useEffect(() => { setRecents(readRecent()); setSpoilers(safe(() => localStorage.getItem(SPOIL_KEY) === "1", false)); }, []);
  const toggleSpoilers = () => { const v = !spoilers; setSpoilers(v); safe(() => localStorage.setItem(SPOIL_KEY, v ? "1" : "0"), undefined); };
  useEffect(() => { const un = lockScroll(); return un; }, []);

  /* ----- roster, for the position. Late answers for an older position are ignored. ----- */
  // With spoilers allowed the whole series is in scope, whatever the position says.
  const rpos: Pos | null = tv && spoilers ? { s: null, e: null } : pos;
  const pk = posKey(rpos);
  useEffect(() => {
    const id = ++reqId.current;
    setRosterErr(false);
    whoApi.roster(urlKey(brief.key), rpos).then((r) => { if (id === reqId.current) setRoster(r); }).catch(() => { if (id === reqId.current) setRosterErr(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.key, pk, retry]);
  const rosterFresh = roster && roster.key === brief.key && posKey(roster.pos) === pk ? roster : null;

  /* ----- position: saved in the watch cookie when there is a watch for this title, always mirrored in the URL ----- */
  const changePos = useCallback((p: Pos) => {
    setPos(p);
    const u = new URLSearchParams({ k: urlKey(brief.key) });
    if (p.s != null) u.set("s", String(p.s));
    if (p.s != null && p.e != null) u.set("e", String(p.e));
    try { window.history.replaceState(window.history.state, "", `/who?${u}`); } catch { /* the URL is a convenience */ }
    const w = wc?.watch;
    if (w && w.key === brief.key) {
      const exact = p.s != null && p.s > 0 && p.e != null && p.e > 0;
      wc.save({ ...w, s: p.s && p.s > 0 ? p.s : 1, e: p.e && p.e > 0 ? p.e : 1, pos: exact ? undefined : p });
    }
  }, [brief.key, wc]);
  const setExact = useCallback((s: number, e: number) => changePos({ s, e }), [changePos]);

  /* ----- what is being watched, as a date (the default thing every gap is measured from) ----- */
  const [seasonEps, setSeasonEps] = useState<{ s: number; air: string[]; ep: Record<number, string> } | null>(null);
  useEffect(() => {
    if (!tv || !pos || pos.s == null) { setSeasonEps(null); return; }
    let live = true;
    const s = pos.s;
    whoApi.season(brief.id, s).then((r) => { if (live) setSeasonEps({ s, air: r.episodes.map((x) => x.air).filter(Boolean).sort(), ep: Object.fromEntries(r.episodes.map((x) => [x.e, x.air])) }); }).catch(() => { if (live) setSeasonEps(null); });
    return () => { live = false; };
  }, [brief.id, tv, pos?.s]); // eslint-disable-line react-hooks/exhaustive-deps
  const watched: Watched = useMemo(() => {
    if (!tv) return { label: brief.title, range: brief.first ? day(brief.first) : null, at: brief.first, atLabel: "when it came out" };
    const k = scopeKind(pos);
    if (k === "exact" && pos && seasonEps?.s === pos.s) {
      const d = seasonEps.ep[pos.e!];
      return { label: `${brief.title} ${posLabel(pos)}`, range: d ? day(d) : null, at: d ?? "", atLabel: "in this episode" };
    }
    if (k === "season" && pos && seasonEps?.s === pos.s && seasonEps.air.length) {
      return { label: `${brief.title} ${posLabel(pos)}`, range: { start: seasonEps.air[0], end: seasonEps.air[seasonEps.air.length - 1] }, at: seasonEps.air[0], atLabel: `in season ${pos.s}` };
    }
    if (k === "all") return { label: brief.title, range: brief.first ? { start: brief.first, end: brief.last || brief.first } : null, at: brief.first, atLabel: "when it began" };
    return { label: `${brief.title} ${posLabel(pos)}`, range: null, at: "", atLabel: "" };
  }, [tv, brief, pos, seasonEps]);

  /* ----- trail: steps after the root and a cursor; going back keeps the later steps, a new step replaces them ----- */
  const current: Node = currentNode(trail);
  const push = useCallback((n: Node) => setTrail((t) => pushNode(t, n, bid())), []);
  const openFromFinder = useCallback((f: { id: number; name: string; photo: string | null }, o?: { hl?: string }) => {
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement.closest(".wx-finder") ? document.activeElement : null;
    setTrail(startTrail([{ t: "person", id: f.id, name: f.name, photo: f.photo, hl: o?.hl }], bid()));
    setOpen(true);
  }, []);
  const restore = useCallback((r: RecentTrail) => { setTrail(startTrail(r.nodes, r.id)); setOpen(true); }, []);
  const back = useCallback(() => {
    if (trail.cur > 0) setTrail((t) => jumpTo(t, t.cur - 1)); else setOpen(false);
  }, [trail.cur]);
  const jump = (i: number) => setTrail((t) => jumpTo(t, i));
  const prefetchPerson = useCallback((id: number) => { void whoApi.person(id).catch(() => {}); }, []);

  // Every line of history is remembered under "Recently opened" (the same branch is updated in place as it grows).
  useEffect(() => { if (trail.nodes.length) setRecents(saveRecent({ id: trail.branch, k: brief.key, nodes: trail.nodes })); }, [trail.nodes, trail.branch, brief.key]);

  // Move focus to the node's heading when it changes (and back to the tile you came from when you leave it).
  const lastId = useRef("root");
  useEffect(() => {
    const id = nodeId(current);
    if (id === lastId.current) return;
    const wasRoot = id === "root";
    lastId.current = id;
    pane.current?.scrollTo({ top: 0 });
    const t = setTimeout(() => {
      if (wasRoot && opener.current && document.contains(opener.current)) { opener.current.focus({ preventScroll: true }); return; }
      pane.current?.querySelector<HTMLElement>("[data-focus-target]")?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(t);
  }, [current]);

  /* ----- keyboard: "/" focuses the finder; Esc goes back one step ----- */
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (document.querySelector(".modal")) return; // a title or person popup is open over this page: it owns the keys
      if (ev.key === "/" && !typing && !ev.metaKey && !ev.ctrlKey && !ev.altKey) { ev.preventDefault(); input.current?.focus(); input.current?.select(); return; }
      if (ev.key === "Escape") {
        if (t === input.current && input.current?.value) { ev.preventDefault(); setQ(""); return; }
        if (trail.cur > 0 || open) { ev.preventDefault(); back(); }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [trail.cur, open, back]);

  const close = () => {
    const same = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin) && window.history.length > 1;
    if (same) router.back(); else router.push("/");
  };

  const faces = useMemo(() => new Map((rosterFresh?.faces ?? roster?.faces ?? []).map((f) => [f.id, f])), [rosterFresh, roster]);
  const clip = tv && !spoilers ? pos : null;
  const rootLabel = tv ? [brief.title, posCode(pos)].filter(Boolean).join(" ") : brief.title;
  const zoom = useCallback((p: { path: string; name: string; size?: string }) => setZoomed(p), []);
  const ctx = useMemo(() => ({ brief, today, pos, scope: scopeKind(pos), clip, spoilers, rootLabel, faces, watched, push, setExact, zoom, prefetchPerson }), [brief, today, pos, clip, spoilers, rootLabel, faces, watched, push, setExact, zoom, prefetchPerson]);
  const roster4finder = rosterFresh ?? roster;

  return (
    <WhoProvider value={ctx}>
      <div className="wx" role="main" aria-label={`Watching now: ${brief.title}`}>
        <header className="wx-top">
          <ZoomBtn path={brief.poster} name={brief.title} className="wx-posterb"><Photo path={brief.poster} name={brief.title} w="w92" className="wx-poster" eager /></ZoomBtn>
          <div className="wx-ttl">
            <span className="wbar-k"><span className="live-dot" aria-hidden="true" />Watching now</span>
            <b className="wx-title">{brief.title}</b>
            <span className="small muted">{[brief.year, tv ? posLabel(pos) : "Film"].filter(Boolean).join(" · ")}</span>
          </div>
          {tv && pos && <PositionControl brief={brief} pos={pos} onChange={changePos} />}
          <div className="wx-topr">
            <button type="button" role="switch" aria-checked={spoilers} className="wx-nospoil" onClick={toggleSpoilers}
              title={spoilers ? "Spoilers are shown: the whole series, past where you are" : "Spoilers are hidden: everything stops at where you are"}>
              <span className="wx-sw" aria-hidden="true" /><span>{spoilers ? "Show spoilers" : "No spoilers"}</span>
            </button>
            <button type="button" className="back wx-close" onClick={close}><span aria-hidden="true">&#215;</span> Close</button>
          </div>
        </header>
        <div className="wx-main">
          <div className="wx-left" aria-label="Finder">
            <Finder roster={roster4finder} loading={!roster && !rosterErr} err={rosterErr && !roster} q={q} setQ={setQ} inputRef={input} recents={recents.filter((r) => r.k === brief.key)}
              onOpen={openFromFinder} onRestore={restore} onRetry={() => setRetry((n) => n + 1)} />
          </div>
          <aside className={`wx-right${rosterFresh ? "" : " loading"}`} data-open={open} aria-label="Details" ref={pane} aria-busy={!rosterFresh}>
            <div className="wx-trailbar">
              <Trail nodes={trail.nodes} cur={trail.cur} onJump={jump} />
              <button type="button" className="back wx-xclose" onClick={() => setOpen(false)}><span aria-hidden="true">&#215;</span> Close</button>
            </div>
            <div className="wx-nodebody">
              {current.t === "root" && <RootNode />}
              {current.t === "person" && <PersonNode key={current.id} node={current} />}
              {current.t === "title" && <TitleNode key={current.key} node={current} />}
              {current.t === "pair" && <PairNode key={nodeId(current)} node={current} />}
              {current.t === "episode" && <EpisodeNode key={nodeId(current)} node={current} />}
            </div>
          </aside>
          {!open && <Dock node={current} onOpen={() => setOpen(true)} />}
        </div>
        {zoomed && <Lightbox path={zoomed.path} name={zoomed.name} size={zoomed.size} onClose={() => setZoomed(null)} />}
      </div>
    </WhoProvider>
  );
}
