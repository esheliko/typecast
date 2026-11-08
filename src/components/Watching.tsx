"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setProgress } from "@/app/actions";
import { useLib } from "./cast/LibState";
import { useBackClose } from "@/lib/back-layer";
import { img } from "@/lib/img";
import { quickQuestions, serializeWatch, WATCH_COOKIE, WATCH_MAX_MS, whereLabel, type Watch } from "@/lib/watching";
import type { Item } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };
type Face = { id: number; name: string; photo: string | null; role: string; guest?: boolean; hits: { key: string; title: string; year: string }[] };

interface Ctx {
  watch: Watch | null;
  start: (it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => void;
  stop: () => void;
  open: (question?: string) => void;
}
const WatchCtx = createContext<Ctx | null>(null);
const useWatch = () => useContext(WatchCtx);

const CHAT_KEY = "typecast.ask";
const SPOIL_KEY = "typecast.ask.spoilers";
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

function writeCookie(w: Watch | null) {
  document.cookie = w
    ? `${WATCH_COOKIE}=${serializeWatch(w)}; path=/; max-age=${WATCH_MAX_MS / 1000}; samesite=lax`
    : `${WATCH_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Holds the current watch, draws the Watching-now bar above the tabs, and the Ask sheet. Lives in the app layout. */
export function WatchProvider({ initial, children }: { initial: Watch | null; children: React.ReactNode }) {
  const [watch, setWatch] = useState<Watch | null>(initial);
  const [sheet, setSheet] = useState<{ q?: string } | null>(null);
  const save = useCallback((w: Watch | null) => { writeCookie(w); setWatch(w); }, []);

  const start = useCallback((it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => {
    const w: Watch = { key: it.key, type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster, started: Date.now(), runtime };
    if (it.type === "tv") { w.s = ep?.s || 1; w.e = ep?.e || 1; }
    // A new title starts a new conversation; restarting the same one keeps it.
    if (safe(() => JSON.parse(localStorage.getItem(CHAT_KEY) ?? "{}").key, null) !== it.key) safe(() => localStorage.removeItem(CHAT_KEY), undefined);
    save(w);
    setSheet({});
  }, [save]);
  const stop = useCallback(() => { save(null); setSheet(null); safe(() => localStorage.removeItem(CHAT_KEY), undefined); }, [save]);
  const open = useCallback((q?: string) => setSheet({ q }), []);

  return (
    <WatchCtx.Provider value={{ watch, start, stop, open }}>
      {children}
      {watch && <WatchBar w={watch} onOpen={() => setSheet({})} />}
      {watch && sheet && <AskSheet w={watch} first={sheet.q} onChange={save} onClose={() => setSheet(null)} onStop={stop} />}
    </WatchCtx.Provider>
  );
}

/** Re-renders every 30 seconds so "42 min in" keeps up. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

function WatchBar({ w, onOpen }: { w: Watch; onOpen: () => void }) {
  const now = useNow();
  return (
    <div className="wbar" role="region" aria-label="Watching now">
      <button type="button" className="wbar-in" onClick={onOpen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {w.poster ? <img src={img(w.poster, "w92")} alt="" /> : <span className="wbar-ph" />}
        <span className="wbar-t">
          <span className="wbar-k"><span className="live-dot" aria-hidden="true" />Watching now</span>
          <b>{w.title}</b>
          <span className="small muted">{whereLabel(w, now)}</span>
        </span>
        <span className="btn sm gold wbar-ask">Ask</span>
      </button>
    </div>
  );
}

/** On a title: start watching it now, or, when it is the current watch, jump straight to asking. */
export function WatchButton({ it, runtime, progress }: { it: Item; runtime: number | null; progress?: { s: number; e: number } | null }) {
  const c = useWatch();
  if (!c) return null;
  const mine = c.watch?.key === it.key;
  return (
    <div className="wbtn-row">
      {mine ? (
        <button type="button" className="btn gold" onClick={() => c.open()}><span className="live-dot" aria-hidden="true" />Watching now · Ask anything</button>
      ) : (
        <button type="button" className="btn" onClick={() => c.start(it, runtime, progress)}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
          {c.watch ? "Watch this now instead" : "I'm watching this now"}
        </button>
      )}
      {!mine && <span className="small muted">Ask about the cast, plot or where you know them from.</span>}
    </div>
  );
}

/** Tiny, safe renderer for the assistant's light markdown: **bold**, bullet lines, paragraphs. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : p.replace(/(^|\s)\*([^*]+)\*/g, "$1$2")));
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const b = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (b) { list.push(b[1]); continue; }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const Speech: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

function AskSheet({ w, first, onChange, onClose, onStop }: { w: Watch; first?: string; onChange: (w: Watch) => void; onClose: () => void; onStop: () => void }) {
  const lib = useLib();
  const now = useNow();
  const [msgs, setMsgs] = useState<Msg[]>(() => safe(() => { const j = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "{}"); return j.key === w.key && Array.isArray(j.msgs) ? j.msgs : []; }, []));
  const [spoilers, setSpoilers] = useState(() => safe(() => localStorage.getItem(SPOIL_KEY) === "1", false));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [faces, setFaces] = useState<Face[] | null>(null);
  const [facesErr, setFacesErr] = useState(false);
  const [ending, setEnding] = useState(false);
  const [listening, setListening] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const rec = useRef<any>(null);
  const asked = useRef(false);

  useBackClose(true, onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  useEffect(() => () => { abort.current?.abort(); rec.current?.abort?.(); }, []);
  useEffect(() => { if (!busy) safe(() => localStorage.setItem(CHAT_KEY, JSON.stringify({ key: w.key, msgs: msgs.slice(-30) })), undefined); }, [msgs, busy, w.key]);
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  // The faces on screen (this episode's, for a series), with where the user knows each of them from.
  const epKey = `${w.key}:${w.s ?? 0}:${w.e ?? 0}`;
  useEffect(() => {
    let live = true;
    setFaces(null); setFacesErr(false);
    fetch("/api/ask").then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (live) setFaces(j.faces ?? []); }).catch(() => { if (live) setFacesErr(true); });
    return () => { live = false; };
  }, [epKey]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setQ("");
    const history: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctl = new AbortController(); abort.current = ctl;
    let got = "";
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history, spoilers }), signal: ctl.signal });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? `Failed (${r.status})`);
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        got += dec.decode(value, { stream: true });
        setMsgs([...history, { role: "assistant", content: got }]);
      }
      if (!got.trim()) throw new Error("No answer came back. Try again in a moment.");
    } catch (e) {
      if ((e as Error).name === "AbortError") { setMsgs([...history, { role: "assistant", content: got || "(Stopped)" }]); return; }
      setMsgs([...history, { role: "assistant", content: got || `⚠ ${(e as Error).message || "Couldn't answer right now."}` }]);
    } finally { setBusy(false); }
  }, [busy, msgs, spoilers]);

  // A question handed in when the sheet opened (a face, a chip elsewhere) is asked once.
  useEffect(() => { if (first && !asked.current) { asked.current = true; send(first); } }, [first, send]);

  const shift = (min: number) => onChange({ ...w, started: Math.min(Date.now(), w.started - min * 60000) });
  const setEp = (s: number, e: number) => {
    const next = { ...w, s: Math.max(1, s), e: Math.max(1, e) };
    onChange(next);
    if (lib.get(w.key)) setProgress("tv", w.id, next.s!, next.e!).then(lib.touch).catch(() => {});
  };
  const toggleSpoilers = () => { const v = !spoilers; setSpoilers(v); safe(() => localStorage.setItem(SPOIL_KEY, v ? "1" : "0"), undefined); };
  const listen = () => {
    if (listening) { rec.current?.stop(); return; }
    const r = new Speech();
    r.lang = navigator.language || "en-US"; r.interimResults = true; r.maxAlternatives = 1;
    let final = "";
    r.onresult = (ev: any) => { const t = Array.from(ev.results as ArrayLike<any>).map((x: any) => x[0].transcript).join(""); final = t; setQ(t); };
    r.onend = () => { setListening(false); if (final.trim()) send(final); };
    r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  };
  const finish = (watched: boolean) => {
    if (watched) lib.mark({ key: w.key, type: w.type, id: w.id, title: w.title, year: w.year, poster: w.poster }, "watched", undefined, true);
    onStop();
  };

  const chips = quickQuestions(w.type);
  return (
    <div className="gl-wrap ask-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gl ask" role="dialog" aria-modal="true" aria-label={`Ask about ${w.title}`}>
        <div className="gl-bar">
          <div style={{ minWidth: 0 }}>
            <div className="wbar-k"><span className="live-dot" aria-hidden="true" />Watching now</div>
            <b className="gl-h">{w.title}</b>
          </div>
          <button type="button" className="back" onClick={onClose} aria-label="Close"><span aria-hidden="true">&#215;</span> Close</button>
        </div>

        <div className="gl-body" ref={body}>
          <div className="ask-where">
            {w.type === "tv" && (
              <span className="ask-step" role="group" aria-label="Episode">
                <button type="button" onClick={() => setEp((w.s ?? 1) - 1, 1)} aria-label="Previous season" disabled={(w.s ?? 1) <= 1}>−</button>
                <b>S{w.s}</b>
                <button type="button" onClick={() => setEp((w.s ?? 1) + 1, 1)} aria-label="Next season">+</button>
                <button type="button" onClick={() => setEp(w.s ?? 1, (w.e ?? 1) - 1)} aria-label="Previous episode" disabled={(w.e ?? 1) <= 1}>−</button>
                <b>E{w.e}</b>
                <button type="button" onClick={() => setEp(w.s ?? 1, (w.e ?? 1) + 1)} aria-label="Next episode">+</button>
              </span>
            )}
            <span className="ask-step" role="group" aria-label="How far in">
              <button type="button" onClick={() => shift(-5)} aria-label="5 minutes less">−5</button>
              <b>{whereLabel({ ...w, type: "movie" }, now)}</b>
              <button type="button" onClick={() => shift(5)} aria-label="5 minutes more">+5</button>
            </span>
            <button type="button" className="chip" aria-pressed={spoilers} onClick={toggleSpoilers}>{spoilers ? "Spoilers OK" : "No spoilers"}</button>
          </div>

          <div className="ask-faces" aria-label="Who's on screen">
            {!faces && !facesErr && <p className="small muted" style={{ margin: 0 }}><span className="spin" />Loading the cast</p>}
            {faces?.map((f) => (
              <button key={f.id} type="button" className="ask-face" onClick={() => send(`Where do I know ${f.name}${f.role ? ` (${f.role})` : ""} from?`)} disabled={busy}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.photo ? <img src={img(f.photo, "w185")} alt="" loading="lazy" /> : <span className="ask-noph" aria-hidden="true">{f.name[0]}</span>}
                <b>{f.name}</b>
                {f.role && <span className="small muted">{f.role}</span>}
                {f.hits.length > 0 ? <span className="ask-seen">Seen in {f.hits[0].title}{f.hits.length > 1 ? ` +${f.hits.length - 1}` : ""}</span> : f.guest ? <span className="small muted">Guest</span> : null}
              </button>
            ))}
          </div>
          {faces && faces.length > 0 && msgs.length === 0 && <p className="small muted" style={{ margin: "2px 0 12px" }}>Tap a face to ask where you know them from, or ask anything below.</p>}

          {msgs.length === 0 && (
            <div className="chips ask-chips">
              {chips.map((c) => <button key={c} type="button" className="chip" onClick={() => send(c)} disabled={busy}>{c}</button>)}
            </div>
          )}

          <div className="ask-log" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`ask-msg ${m.role}`}>
                {m.role === "user" ? m.content : m.content ? <Rich text={m.content} /> : <span className="muted"><span className="spin" />Thinking</span>}
              </div>
            ))}
          </div>
          {msgs.length > 0 && !busy && (
            <div className="chips scroll ask-more">
              <button type="button" className="chip" onClick={() => { setMsgs([]); input.current?.focus(); }}>New chat</button>
              {chips.slice(0, 5).map((c) => <button key={c} type="button" className="chip" onClick={() => send(c)}>{c}</button>)}
            </div>
          )}

          <div className="ask-end">
            {ending ? (
              <>
                {w.type === "movie" && <button type="button" className="btn sm gold" onClick={() => finish(true)}>Finished: mark watched</button>}
                <button type="button" className="btn sm" onClick={() => finish(false)}>Stop watching</button>
                <button type="button" className="linkish small" onClick={() => setEnding(false)}>Keep watching</button>
              </>
            ) : <button type="button" className="linkish small" onClick={() => setEnding(true)}>End this watch</button>}
          </div>
        </div>

        <form className="ask-input" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <textarea ref={input} value={q} rows={1} placeholder={listening ? "Listening…" : `Ask anything about ${w.title}`} aria-label="Your question"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }} />
          {Speech && <button type="button" className={`ask-mic${listening ? " on" : ""}`} onClick={listen} aria-label={listening ? "Stop listening" : "Ask by voice"} aria-pressed={listening}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
          </button>}
          {busy
            ? <button type="button" className="btn sm" onClick={() => { abort.current?.abort(); setBusy(false); }}>Stop</button>
            : <button type="submit" className="btn sm gold" disabled={!q.trim()}>Ask</button>}
        </form>
      </div>
    </div>
  );
}
