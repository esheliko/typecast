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
import { Photo } from "./bits";
import { nodeId, nodeLabel, WhoProvider, type Node, type Watched } from "./WhoContext";
import { lockScroll } from "@/lib/scroll-lock";
import { day } from "@/lib/who-dates";
import { posKey, pushRecent, readRecent, whoApi, type Recent } from "@/lib/who-client";
import { posLabel, scopeKind, urlKey } from "@/lib/who-scope";
import type { WhoBrief } from "@/lib/who-data";
import type { Pos, WhoRoster } from "@/lib/who-types";

const ROOT: Node = { t: "root" };

/** The /who page: top bar, the finder (left) and the node you opened (right), joined by a trail. Position lives in the watch cookie when there is a watch, else the URL. */
export function WhoApp({ brief, initialPos, today }: { brief: WhoBrief; initialPos: Pos | null; today: string }) {
  const router = useRouter();
  const wc = useWatchControl();
  const tv = brief.type === "tv";
  const [pos, setPos] = useState<Pos | null>(tv ? initialPos ?? { s: null, e: null } : null);
  const [roster, setRoster] = useState<WhoRoster | null>(null);
  const [rosterErr, setRosterErr] = useState(false);
  const [retry, setRetry] = useState(0);
  const [stack, setStack] = useState<Node[]>([]);
  const [rootOpen, setRootOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<Recent[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const reqId = useRef(0);

  useEffect(() => { setRecents(readRecent()); }, []);
  useEffect(() => { const un = lockScroll(); return un; }, []);

  /* ----- roster, for the position. Late answers for an older position are ignored. ----- */
  const pk = posKey(pos);
  useEffect(() => {
    const id = ++reqId.current;
    setRosterErr(false);
    whoApi.roster(urlKey(brief.key), pos).then((r) => { if (id === reqId.current) setRoster(r); }).catch(() => { if (id === reqId.current) setRosterErr(true); });
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

  /* ----- trail ----- */
  const current: Node = stack[stack.length - 1] ?? ROOT;
  const trail: Node[] = [ROOT, ...stack];
  const push = useCallback((n: Node) => setStack((s) => (nodeId(s[s.length - 1] ?? ROOT) === nodeId(n) ? s : [...s, n].slice(-14))), []);
  const openFromFinder = useCallback((f: { id: number; name: string; photo: string | null }, o?: { hl?: string }) => {
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement.closest(".wx-finder") ? document.activeElement : null;
    setStack([{ t: "person", id: f.id, name: f.name, photo: f.photo, hl: o?.hl }]);
  }, []);
  const back = useCallback(() => {
    if (stack.length) setStack((s) => s.slice(0, -1)); else setRootOpen(false);
  }, [stack.length]);
  const jump = (i: number) => { setStack((s) => s.slice(0, i)); if (i === 0) setRootOpen(true); };
  const prefetchPerson = useCallback((id: number) => { void whoApi.person(id).catch(() => {}); }, []);

  useEffect(() => { if (current.t === "person") setRecents(pushRecent({ id: current.id, name: current.name, photo: current.photo })); }, [current.t === "person" ? current.id : 0]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (stack.length || rootOpen) { ev.preventDefault(); back(); }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [stack.length, rootOpen, back]);

  const close = () => {
    const same = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin) && window.history.length > 1;
    if (same) router.back(); else router.push("/");
  };

  const faces = useMemo(() => new Map((rosterFresh?.faces ?? roster?.faces ?? []).map((f) => [f.id, f])), [rosterFresh, roster]);
  const ctx = useMemo(() => ({ brief, today, pos, scope: scopeKind(pos), faces, watched, push, setExact, prefetchPerson }), [brief, today, pos, faces, watched, push, setExact, prefetchPerson]);
  const nodeOpen = stack.length > 0 || rootOpen;

  return (
    <WhoProvider value={ctx}>
      <div className="wx" role="main" aria-label={`Who's that? ${brief.title}`}>
        <header className="wx-top">
          <Photo path={brief.poster} name={brief.title} w="w92" className="wx-poster" eager />
          <div className="wx-ttl">
            <span className="wbar-k"><span className="live-dot" aria-hidden="true" />Who&rsquo;s that?</span>
            <b className="wx-title">{brief.title}</b>
            <span className="small muted">{[brief.year, tv ? posLabel(pos) : "Film"].filter(Boolean).join(" · ")}</span>
          </div>
          {tv && pos && <PositionControl brief={brief} pos={pos} onChange={changePos} />}
          <button type="button" className="back wx-close" onClick={close}><span aria-hidden="true">&#215;</span> Close</button>
        </header>
        <div className="wx-main">
          <div className="wx-left" aria-label="Finder">
            <Finder roster={rosterFresh ?? roster} loading={!roster && !rosterErr} err={rosterErr && !roster} q={q} setQ={setQ} inputRef={input} recents={recents}
              onOpen={openFromFinder} onRetry={() => setRetry((n) => n + 1)} />
            <button type="button" className="chip wx-about" onClick={() => { setStack([]); setRootOpen(true); }}>About {brief.title}</button>
          </div>
          <aside className={`wx-right${rosterFresh ? "" : " loading"}`} data-open={nodeOpen} aria-label="Details" ref={pane} aria-busy={!rosterFresh}>
            <div className="wx-trailbar">
              <button type="button" className="back wx-back" onClick={back}><span aria-hidden="true">&#8249;</span> Back</button>
              <nav className="wx-trail" aria-label="Trail">
                <ol>
                  {trail.map((n, i) => {
                    const last = i === trail.length - 1;
                    return (
                      <li key={`${i}-${nodeId(n)}`}>
                        {last ? <span aria-current="step" className="wx-tcur">{nodeLabel(n)}</span> : <button type="button" className="wx-tstep" onClick={() => jump(i)}>{nodeLabel(n)}</button>}
                        {!last && <span className="wx-sep" aria-hidden="true">›</span>}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>
            <div className="wx-nodebody">
              {current.t === "root" && <RootNode />}
              {current.t === "person" && <PersonNode key={current.id} node={current} />}
              {current.t === "title" && <TitleNode key={current.key} node={current} />}
              {current.t === "pair" && <PairNode key={nodeId(current)} node={current} />}
            </div>
          </aside>
        </div>
      </div>
    </WhoProvider>
  );
}
