"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { PersonLink, TitleLink } from "./Modal";
import { useLib } from "./cast/LibState";
import { continuePlace, restorePlan, revertDecision, startPlan, watchAfterSignal } from "@/lib/watch-library";
import { clearPrompt, forgetPartly, readPartly, refreshPartly, rememberPartly } from "@/lib/watch-prev";
import { img } from "@/lib/img";
import { serializeWatch, WATCH_COOKIE, WATCH_MAX_MS, whereLabel, type Watch } from "@/lib/watching";
import type { Item } from "@/lib/types";
import type { Answer, AnswerCard } from "@/lib/answer";

interface Ctx {
  watch: Watch | null;
  /** Replace the stored watch (the /watching page moves the position with it, so the bar stays in step). */
  save: (w: Watch | null) => void;
  start: (it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => void;
  /**
   * A real "I am watching this" signal (Next, the film clock's play and +-5 min): makes `it` the current watch if it is not, and moves a title that is missing,
   * To watch or Partly watched to Watching (same rules, `prev` and toast as the start button, without leaving the page). Resolves true once the library row is in place.
   */
  signal: (it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => Promise<boolean>;
  /** Changes the current watch if it is for `key` (reads the latest watch, so it never undoes a change made a moment earlier). */
  patchWatch: (key: string, f: (w: Watch) => Watch) => void;
  /** Ends the watch. Unless `restore` is false, a title this watch moved to Watching goes back to what it was (see `restorePlan`). */
  stop: (opts?: { restore?: boolean }) => void;
}
const WatchCtx = createContext<Ctx | null>(null);
const useWatch = () => useContext(WatchCtx);
/** The current watch, a way to change it and a way to end it, for the /watching page. */
export function useWatchControl(): Ctx | null { return useContext(WatchCtx); }

function writeCookie(w: Watch | null) {
  document.cookie = w
    ? `${WATCH_COOKIE}=${serializeWatch(w)}; path=/; max-age=${WATCH_MAX_MS / 1000}; samesite=lax`
    : `${WATCH_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Holds the current watch and draws the Watching-now bar above the tabs (it opens /watching). Lives in the app layout. */
export function WatchProvider({ initial, children }: { initial: Watch | null; children: React.ReactNode }) {
  const [watch, setWatch] = useState<Watch | null>(initial);
  const router = useRouter();
  // The ref is also set by `save`, so a watch saved a moment ago is already what `patchWatch` and `signal` see (before React re-renders).
  const watchRef = useRef(watch);
  const save = useCallback((w: Watch | null) => { watchRef.current = w; writeCookie(w); setWatch(w); }, []);

  const lib = useLib();

  const engage = useCallback((it: Item, runtime: number | null, ep?: { s: number; e: number } | null): Promise<boolean> => {
    const mine = watchRef.current?.key === it.key ? watchRef.current : null;
    const place = it.type === "tv" ? (ep ?? (mine ? { s: mine.s ?? 1, e: mine.e ?? 1 } : { s: 1, e: 1 })) : null;
    // The explicit start and the "I am watching this" signals are the only intents that touch the library: a title that is missing, To watch or Partly watched becomes Watching.
    const plan = startPlan(lib.get(it.key), it.type, place);
    const r = watchAfterSignal(watchRef.current, it, runtime, place, plan, Date.now());
    if (r.created || plan.promote) save(r.watch);
    // Switching to a title that is already Watching changes the bar without any other sign, so say it.
    if (r.replaced && !plan.promote) lib.notify(`${it.title}: now your current watch`);
    refreshPartly(it.key);
    if (!plan.promote) return Promise.resolve(true);
    if (plan.prev.st === "partial") rememberPartly(it);
    return lib.mark(it, "watching", undefined, true, { msg: `${it.title}: added to Watching${firstTime() ? " It will show in your Library." : ""}` });
  }, [save, lib]);

  const start = useCallback((it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => {
    // The saved place needs no write here: the title opens at the episode AFTER its progress, so progress stays as it is (see lib/watch-library.ts).
    engage(it, runtime, it.type === "tv" ? ep ?? { s: 1, e: 1 } : null).catch(() => {});
    router.push("/watching");
  }, [engage, router]);

  const patchWatch = useCallback((key: string, f: (w: Watch) => Watch) => {
    const w = watchRef.current;
    if (w && w.key === key) save(f(w));
  }, [save]);

  const stop = useCallback((opts?: { restore?: boolean }) => {
    const w = watchRef.current;
    if (w && opts?.restore !== false) {
      const m = lib.get(w.key);
      const plan = restorePlan(w, m);
      const it: Item = { key: w.key, type: w.type, id: w.id, title: w.title, year: w.year, poster: w.poster };
      if (plan.do === "set") lib.mark(it, plan.status, plan.priority, true);
      else if (plan.do === "remove") lib.mark(it, null, undefined, true);
    }
    if (w) { forgetPartly(w.key); clearPrompt(w.key); }
    save(null);
  }, [save, lib]);

  // Titles this device moved from Partly watched to Watching go back after 12 hours with no watch (best effort, never blocks rendering).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        for (const { key, rec } of readPartly()) {
          const d = revertDecision(rec, { now: Date.now(), activeWatch: watchRef.current?.key === key, status: lib.get(key)?.status });
          if (d === "keep") continue;
          forgetPartly(key);
          if (d === "revert") lib.mark({ key, type: rec.type, id: rec.id, title: rec.title, year: rec.year, poster: rec.poster }, "partial", undefined, true, { msg: `${rec.title} went back to Partly watched` });
        }
      } catch { /* best effort */ }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <WatchCtx.Provider value={{ watch, save, start, signal: engage, patchWatch, stop }}>
      {children}
      {watch && <WatchBar w={watch} />}
    </WatchCtx.Provider>
  );
}

const SEEN_KEY = "typecast.watchingToastSeen";
/** True the first time on this device (then remembered). When storage is unavailable the extra sentence is simply not shown. */
function firstTime(): boolean {
  try { if (localStorage.getItem(SEEN_KEY)) return false; localStorage.setItem(SEEN_KEY, "1"); return true; } catch { return false; }
}

/** Re-renders every 30 seconds so "42 min in" keeps up. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

function WatchBar({ w }: { w: Watch }) {
  const now = useNow();
  return (
    <div className="wbar" role="region" aria-label="Watching now">
      <Link className="wbar-in" href="/watching">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {w.poster ? <img src={img(w.poster, "w92")} alt="" /> : <span className="wbar-ph" />}
        <span className="wbar-t">
          <span className="wbar-k"><span className="live-dot" aria-hidden="true" />Watching now</span>
          <b>{w.title}</b>
          <span className="small muted">{whereLabel(w, now)}</span>
        </span>
      </Link>
    </div>
  );
}

/** On a title: start watching it now, or, when it is the current watch, open the Watching now page. */
/** `progress` is the library's "watched up to"; the watch starts at the episode after it. */
export function WatchButton({ it, runtime, progress, seasons }: { it: Item; runtime: number | null; progress?: { s: number; e: number } | null; seasons?: { n: number; eps: number }[] }) {
  const c = useWatch();
  if (!c) return null;
  const mine = c.watch?.key === it.key;
  return (
    <div className="wbtn-row">
      {mine ? (
        <Link className="btn gold" href="/watching"><span className="live-dot" aria-hidden="true" />Watching now</Link>
      ) : (
        <button type="button" className="btn" onClick={() => c.start(it, runtime, continuePlace(progress, seasons))}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
          {c.watch ? "Watch this now instead" : "I’m watching this now"}
        </button>
      )}
    </div>
  );
}

/** Tiny, safe renderer for an answer's light markdown: **bold**, bullet lines, quotes, paragraphs. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <i key={i}>{p.slice(1, -1)}</i> : p);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const b = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (b) { list.push(b[1]); continue; }
    flush();
    if (line.startsWith(">")) blocks.push(<blockquote key={blocks.length}>{inline(line.replace(/^>\s*/, ""))}</blockquote>);
    else if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** One fact: its text, the titles and people it names (tappable), and links out. */
export function FactView({ a, onLeave }: { a: Answer; onLeave: () => void }) {
  const titles = (a.cards ?? []).filter((c): c is Extract<AnswerCard, { kind: "title" }> => c.kind === "title");
  const people = (a.cards ?? []).filter((c): c is Extract<AnswerCard, { kind: "person" }> => c.kind === "person");
  return (
    <>
      <Rich text={a.text} />
      {people.length > 0 && (
        <div className="ask-cards">
          {people.map((p) => (
            <PersonLink key={p.id} pid={p.id} it={p} className="ask-pc" onClick={onLeave}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.photo ? <img src={img(p.photo, "w185")} alt="" loading="lazy" /> : <span className="ask-noph" aria-hidden="true">{p.name[0]}</span>}
              <b>{p.name}</b>{p.sub && <span className="small muted">{p.sub}</span>}
            </PersonLink>
          ))}
        </div>
      )}
      {titles.length > 0 && (
        <div className="ask-cards">
          {titles.map((t) => (
            <TitleLink key={t.key} k={t.key} it={t} className="ask-tc" onClick={onLeave}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {t.poster ? <img src={img(t.poster, "w185")} alt="" loading="lazy" /> : <span className="ask-noph" aria-hidden="true">{t.title[0]}</span>}
              <b>{t.title}</b>
              <span className="small muted">{[t.year, t.sub].filter(Boolean).join(" · ")}</span>
              {t.status && <span className={`ask-st ${t.status === "watchlist" ? "list" : "seen"}`}>{t.status === "watchlist" ? "On your list" : "Seen"}</span>}
            </TitleLink>
          ))}
        </div>
      )}
      {a.links && a.links.length > 0 && <div className="ask-links">{a.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}</div>}
    </>
  );
}
