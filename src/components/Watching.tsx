"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { PersonLink, TitleLink } from "./Modal";
import { img } from "@/lib/img";
import { serializeWatch, WATCH_COOKIE, WATCH_MAX_MS, whereLabel, type Watch } from "@/lib/watching";
import type { Item } from "@/lib/types";
import type { Answer, AnswerCard } from "@/lib/answer";

interface Ctx {
  watch: Watch | null;
  /** Replace the stored watch (the /watching page moves the position with it, so the bar stays in step). */
  save: (w: Watch | null) => void;
  start: (it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => void;
  stop: () => void;
}
const WatchCtx = createContext<Ctx | null>(null);
const useWatch = () => useContext(WatchCtx);
/** The current watch, a way to change it and a way to end it, for the /watching page. */
export function useWatchControl(): { watch: Watch | null; save: (w: Watch | null) => void; stop: () => void } | null { return useContext(WatchCtx); }

function writeCookie(w: Watch | null) {
  document.cookie = w
    ? `${WATCH_COOKIE}=${serializeWatch(w)}; path=/; max-age=${WATCH_MAX_MS / 1000}; samesite=lax`
    : `${WATCH_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Holds the current watch and draws the Watching-now bar above the tabs (it opens /watching). Lives in the app layout. */
export function WatchProvider({ initial, children }: { initial: Watch | null; children: React.ReactNode }) {
  const [watch, setWatch] = useState<Watch | null>(initial);
  const router = useRouter();
  const save = useCallback((w: Watch | null) => { writeCookie(w); setWatch(w); }, []);

  const start = useCallback((it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => {
    const w: Watch = { key: it.key, type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster, started: Date.now(), runtime };
    if (it.type === "tv") { w.s = ep?.s || 1; w.e = ep?.e || 1; }
    save(w);
    router.push("/watching");
  }, [save, router]);
  const stop = useCallback(() => save(null), [save]);

  return (
    <WatchCtx.Provider value={{ watch, save, start, stop }}>
      {children}
      {watch && <WatchBar w={watch} />}
    </WatchCtx.Provider>
  );
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
export function WatchButton({ it, runtime, progress }: { it: Item; runtime: number | null; progress?: { s: number; e: number } | null }) {
  const c = useWatch();
  if (!c) return null;
  const mine = c.watch?.key === it.key;
  return (
    <div className="wbtn-row">
      {mine ? (
        <Link className="btn gold" href="/watching"><span className="live-dot" aria-hidden="true" />Watching now</Link>
      ) : (
        <button type="button" className="btn" onClick={() => c.start(it, runtime, progress)}>
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
