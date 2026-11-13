"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TitleLink } from "../Modal";
import { TitleSwitcher } from "./TitleSwitcher";
import { useWatchControl } from "../Watching";
import { useLib } from "../cast/LibState";
import { usePublishPageLine } from "../PageLine";
import { useSavedPlace } from "./useSavedPlace";
import { Finder } from "./Finder";
import { PairNode } from "./PairNode";
import { PersonNode } from "./PersonNode";
import { PositionControl, FilmClock } from "./PositionControl";
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
import { isLastEpisode, seriesEnded } from "@/lib/watch-library";
import { markPromptDone, promptDone } from "@/lib/watch-prev";
import { cleanSession, currentNode, emptyTrail, jumpTo, pushNode, startTrail } from "@/lib/who-trail";
import type { WhoBrief } from "@/lib/who-data";
import type { ResumeCard } from "@/lib/watch-library";
import type { Pos, WhoRoster } from "@/lib/who-types";

const SPOIL_KEY = "typecast.ask.spoilers";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };
const bid = () => Math.random().toString(36).slice(2, 9);

/** The /who page: top bar, the finder (left) and the node you opened (right), joined by a trail. Position lives in the watch cookie when there is a watch, else the URL. */
export function WhoApp({ brief, initialPos, today, others = [], savedProgress = null }: { brief: WhoBrief; initialPos: Pos | null; today: string; others?: ResumeCard[]; savedProgress?: { s: number; e: number } | null }) {
  const router = useRouter();
  const wc = useWatchControl();
  const tv = brief.type === "tv";
  const lib = useLib();
  const item = useMemo(() => ({ key: brief.key, type: brief.type, id: brief.id, title: brief.title, year: brief.year, poster: brief.poster }), [brief]);
  const counts = useMemo(() => brief.seasons.map((x) => ({ n: x.n, eps: x.eps })), [brief.seasons]);
  const { place: savePlace, next: saveNext } = useSavedPlace(item, brief.runtime, counts, savedProgress);
  /** The "That was the last episode" prompt (ended series, Next on its final episode). */
  const [finale, setFinale] = useState(false);
  const [pos, setPos] = useState<Pos | null>(tv ? initialPos ?? { s: null, e: null } : null);
  const [roster, setRoster] = useState<WhoRoster | null>(null);
  const [rosterErr, setRosterErr] = useState(false);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [trail, setTrail] = useState(() => emptyTrail(bid()));
  /** Phones: whether the details cover the finder. (Wide screens always show them.) */
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false); // phones: the header slims down once the face list is scrolled (hysteresis so it never flickers at the edge)
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<RecentTrail[]>([]);
  const [zoomed, setZoomed] = useState<{ path: string; name: string; size?: string; gallery?: string[] } | null>(null);
  /** The page-wide spoiler switch: true = spoilers allowed. Off (the default) keeps everything inside where you are. */
  const [spoilers, setSpoilers] = useState(false);
  usePublishPageLine(brief.key, spoilers);
  const input = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const reqId = useRef(0);

  useEffect(() => { setRecents(readRecent()); setSpoilers(safe(() => localStorage.getItem(SPOIL_KEY) === "1", false)); }, []);
  const toggleSpoilers = () => { const v = !spoilers; setSpoilers(v); safe(() => localStorage.setItem(SPOIL_KEY, v ? "1" : "0"), undefined); };
  useEffect(() => { const un = lockScroll(); return un; }, []);

  /* ----- roster, for the position. Late answers for an older position are ignored. ----- */
  // With spoilers allowed the whole series is in scope, unless one exact episode is chosen.
  // A chosen episode keeps its own cast, though: you still want to see who is in the episode you are watching.
  const rpos: Pos | null = tv && spoilers && scopeKind(pos) !== "exact" ? { s: null, e: null } : pos;
  const pk = posKey(rpos);
  useEffect(() => {
    const id = ++reqId.current;
    setRosterErr(false);
    const exact = tv && scopeKind(rpos) === "exact";
    setMore(false);
    // An exact episode: show TMDB's cast at once, then swap in the list with TVmaze/Fandom guests when it arrives.
    whoApi.roster(urlKey(brief.key), rpos, exact).then((r) => {
      if (id !== reqId.current) return;
      setRoster(r);
      if (!exact) return;
      setMore(true);
      whoApi.roster(urlKey(brief.key), rpos).then((f) => { if (id === reqId.current) { setRoster(f); setMore(false); } }).catch(() => { if (id === reqId.current) setMore(false); });
    }).catch(() => { if (id === reqId.current) setRosterErr(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.key, pk, retry]);
  const rosterFresh = roster && roster.key === brief.key && posKey(roster.pos) === pk ? roster : null;
  // Spoilers allowed on an exact episode: the finder keeps that episode's cast, but "who else is in this" must look across the whole series.
  const wide = tv && spoilers && scopeKind(pos) === "exact";
  const [wideRoster, setWideRoster] = useState<WhoRoster | null>(null);
  useEffect(() => {
    if (!wide) { setWideRoster(null); return; }
    let live = true;
    whoApi.roster(urlKey(brief.key), { s: null, e: null }).then((r) => { if (live) setWideRoster(r); }).catch(() => {});
    return () => { live = false; };
  }, [wide, brief.key]);

  /* ----- position: saved in the watch cookie when there is a watch for this title, always mirrored in the URL ----- */
  const changePos = useCallback((p: Pos) => {
    setPos(p);
    const u = new URLSearchParams({ k: urlKey(brief.key) });
    if (p.s != null) u.set("s", String(p.s));
    if (p.s != null && p.e != null) u.set("e", String(p.e));
    try { window.history.replaceState(window.history.state, "", `/watching?${u}`); } catch { /* the URL is a convenience */ }
    savePlace(p);
    const exact = p.s != null && p.s > 0 && p.e != null && p.e > 0;
    wc?.patchWatch(brief.key, (w) => ({ ...w, s: p.s && p.s > 0 ? p.s : 1, e: p.e && p.e > 0 ? p.e : 1, pos: exact ? undefined : p }));
  }, [brief.key, wc, savePlace]);
  /** Next: the episode you were on is watched; go to the next one (or, on the final episode of an ended series, offer to mark the series watched). */
  const onNext = useCallback((from: { s: number; e: number } | null, to: Pos | null) => {
    if (from) saveNext(from, to && to.s != null && to.e != null ? { s: to.s, e: to.e } : null);
    if (to) changePos(to);
    else if (from && seriesEnded(brief.status) && isLastEpisode(from, brief.seasons) && !promptDone(brief.key)) setFinale(true);
  }, [saveNext, changePos, brief.key, brief.status, brief.seasons]);
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
  // Opening a person from a title: that title is the one to compare first (their row is selected), not the top "You know them from".
  const push = useCallback((n: Node) => setTrail((t) => {
    const from = currentNode(t);
    return pushNode(t, n.t === "person" && !n.hl && from.t === "title" ? { ...n, hl: from.key, still: true } : n, bid());
  }), []);
  // From the finder the title you came from is the one being watched: its row is the default choice (falls back when it has no dates, or for a film).
  const openFromFinder = useCallback((f: { id: number; name: string; photo: string | null }, o?: { hl?: string }) => {
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement.closest(".wx-finder") ? document.activeElement : null;
    setTrail(startTrail([{ t: "person", id: f.id, name: f.name, photo: f.photo, hl: o?.hl ?? brief.key }], bid()));
    setOpen(true);
  }, [brief.key]);
  // Reopening a recent line is ONE history step, so Back closes the details instead of walking back through the restored trail.
  const single = useRef(false);
  const restore = useCallback((r: RecentTrail) => { single.current = true; setTrail(startTrail(r.nodes, r.id)); setOpen(true); }, []);
  const back = useCallback(() => {
    if (trail.cur > 0) setTrail((t) => jumpTo(t, t.cur - 1)); else setOpen(false);
  }, [trail.cur]);
  const jump = (i: number) => setTrail((t) => jumpTo(t, i));
  const prefetchPerson = useCallback((id: number) => { void whoApi.person(id).catch(() => {}); }, []);

  // A refresh keeps you on the same step of the trail: it is saved per title in sessionStorage and put back on mount.
  const sessKey = `typecast.watching.trail.${brief.key}`;
  const [restored, setRestored] = useState(false);
  const restoring = useRef(false);
  useEffect(() => {
    const s = safe(() => cleanSession(JSON.parse(sessionStorage.getItem(sessKey) ?? "null"), brief.key), null);
    if (s) {
      const n = Number((safe(() => window.history.state, null) as { wxDepth?: number } | null)?.wxDepth ?? 0);
      const want = s.open ? s.cur + 1 : 0;
      if (n === want && want > 0) { hd.current = n; lo.current = n; restoring.current = true; }
      setTrail({ nodes: s.nodes, cur: s.cur, branch: s.id });
      setOpen(s.open);
    }
    setRestored(true);
  }, [sessKey, brief.key]);
  useEffect(() => {
    if (!restored) return;
    safe(() => sessionStorage.setItem(sessKey, JSON.stringify({ k: brief.key, id: trail.branch, nodes: trail.nodes, cur: trail.cur, open })), undefined);
  }, [restored, sessKey, brief.key, trail, open]);

  // Every line of history is remembered under "Recently opened" (the same branch is updated in place as it grows).
  useEffect(() => { if (trail.nodes.length) setRecents(saveRecent({ id: trail.branch, k: brief.key, nodes: trail.nodes })); }, [trail.nodes, trail.branch, brief.key]);

  // Move focus to the node's heading when it changes (and back to the tile you came from when you leave it).
  const lastId = useRef("root");
  // A page load or refresh restores the trail without the user doing anything: don't steal focus then (it drew a focus ring round the name).
  const interacted = useRef(false);
  useEffect(() => {
    const on = () => { interacted.current = true; };
    const evs = ["pointerdown", "keydown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, on, { capture: true, passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, on, { capture: true }));
  }, []);
  useEffect(() => {
    const id = nodeId(current);
    if (id === lastId.current) return;
    const wasRoot = id === "root";
    lastId.current = id;
    if (!interacted.current) return;
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

  /* ----- browser Back (phone gesture/button) walks the trail, then closes the details, then leaves the page ----- */
  // depth: 0 = details closed, 1 = details open on the root, k+1 = trail step k. Every level the app goes up gets one history entry,
  // so Back lands one level down; levels the app comes down by itself (Esc, Close, a trail chip) are popped with history.go.
  const depth = open ? trail.cur + 1 : 0;
  const hd = useRef(0);
  const lo = useRef(1); // lowest depth that has a history entry of its own (a reopened recent line has just one, at its top)
  const leaving = useRef(false);
  useEffect(() => {
    if (restoring.current) { if (depth === hd.current) restoring.current = false; return; }
    try {
      if (depth > hd.current) {
        if (single.current && hd.current === 0) {
          window.history.pushState({ ...(window.history.state ?? {}), wxDepth: depth }, "");
          lo.current = depth;
        } else {
          for (let d = hd.current + 1; d <= depth; d++) window.history.pushState({ ...(window.history.state ?? {}), wxDepth: d }, "");
        }
        hd.current = depth;
      } else if (depth < hd.current) {
        if (depth >= lo.current) {
          const n = hd.current - depth;
          hd.current = depth;
          window.history.go(-n);
        } else if (depth > 0) { // stepping below the only entry: reuse it
          window.history.replaceState({ ...(window.history.state ?? {}), wxDepth: depth }, "");
          hd.current = depth; lo.current = depth;
        } else {
          const n = hd.current - lo.current + 1;
          hd.current = 0; lo.current = 1;
          window.history.go(-n);
        }
      }
    } catch { /* history is a convenience */ }
    single.current = false;
  }, [depth]);
  useEffect(() => {
    const pop = () => {
      const n = Number((window.history.state as { wxDepth?: number } | null)?.wxDepth ?? 0);
      hd.current = n;
      if (n === 0) { lo.current = 1; setOpen(false); if (leaving.current) { leaving.current = false; window.history.back(); } }
      else { setOpen(true); setTrail((t) => jumpTo(t, n - 1)); }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  // Close always lands on the main app. Walking history back is unreliable here (the trail and details add entries, and
  // document.referrer only describes the first load), so it once stepped back through the trail instead of leaving.
  const close = () => { leaving.current = false; router.push("/"); };

  const faces = useMemo(() => new Map((wide && wideRoster && wideRoster.key === brief.key ? wideRoster.faces : rosterFresh?.faces ?? roster?.faces ?? []).map((f) => [f.id, f])), [wide, wideRoster, brief.key, rosterFresh, roster]);
  const clip = tv && !spoilers ? pos : null;
  const rootLabel = tv ? [brief.title, posCode(pos)].filter(Boolean).join(" ") : brief.title;
  const zoom = useCallback((p: { path: string; name: string; size?: string; gallery?: string[] }) => setZoomed(p), []);
  const ctx = useMemo(() => ({ brief, today, pos, scope: scopeKind(pos), clip, spoilers, rootLabel, faces, watched, push, setExact, zoom, prefetchPerson }), [brief, today, pos, clip, spoilers, rootLabel, faces, watched, push, setExact, zoom, prefetchPerson]);
  const roster4finder = rosterFresh ?? roster;

  return (
    <WhoProvider value={ctx}>
      <div className="wx" data-compact={compact} role="main" aria-label={`Watching now: ${brief.title}`}>
        <header className="wx-top">
          <ZoomBtn path={brief.poster} name={brief.title} className="wx-posterb"><Photo path={brief.poster} name={brief.title} w="w92" className="wx-poster" eager /></ZoomBtn>
          <div className="wx-ttl">
            <span className="wbar-k"><span className="live-dot" aria-hidden="true" />Watching now</span>
            <div className="wx-trl">
              <TitleLink k={brief.key} it={{ title: brief.title, year: brief.year, poster: brief.poster }} className="wx-title wx-titlelink" tabIndex={-1} aria-hidden="true">{brief.title}</TitleLink>
              <TitleSwitcher cards={others} title={brief.title} />
            </div>
            <span className="small muted wx-sub">{[brief.year, tv ? posLabel(pos) : "Film"].filter(Boolean).join(" · ")}
              <TitleLink k={brief.key} it={{ title: brief.title, year: brief.year, poster: brief.poster }} className="wx-details" aria-label={`${brief.title}: open title details`}>Details</TitleLink></span>
          </div>
          {tv && pos && <PositionControl brief={brief} pos={pos} onChange={changePos} onNext={onNext} />}
          {!tv && <FilmClock item={item} runtime={brief.runtime} />}
          <div className="wx-topr">
            <button type="button" role="switch" aria-checked={spoilers} className="wx-nospoil" aria-label={spoilers ? "Show spoilers" : "No spoilers"} onClick={toggleSpoilers}
              title={spoilers ? "Spoilers are shown: the whole series, past where you are" : "Spoilers are hidden: everything stops at where you are"}>
              <span className="wx-sw" aria-hidden="true" /><span className="wx-nsl">{spoilers ? "Show spoilers" : "No spoilers"}</span>
            </button>
            <button type="button" className="back wx-close" aria-label="Close" onClick={close}><span aria-hidden="true">&#215;</span><span className="wx-closet"> Close</span></button>
          </div>
        </header>
        {finale && (
          <p className="wx-finish wx-finale" role="status">
            That was the last episode. Mark the series watched?
            <button type="button" className="linkish" onClick={() => { markPromptDone(brief.key); setFinale(false); lib.mark(item, "watched", undefined, true); wc?.stop({ restore: false }); }}>Mark watched</button>
            <button type="button" className="linkish muted" aria-label="Dismiss" onClick={() => { markPromptDone(brief.key); setFinale(false); }}>&#215;</button>
          </p>
        )}
        <div className="wx-main">
          <div className="wx-left" aria-label="Finder" onScroll={(ev) => { const t = ev.currentTarget.scrollTop; setCompact((c) => (c ? t > 12 : t > 72)); }}>
            <Finder roster={roster4finder} loading={!rosterFresh && !rosterErr} more={more} err={rosterErr && !roster} q={q} setQ={setQ} inputRef={input} recents={recents.filter((r) => r.k === brief.key)}
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
          {!open && <Dock node={current} onOpen={() => { single.current = true; setOpen(true); }} />}
        </div>
        {zoomed && <Lightbox path={zoomed.path} name={zoomed.name} size={zoomed.size} gallery={zoomed.gallery} onClose={() => setZoomed(null)} />}
      </div>
    </WhoProvider>
  );
}
