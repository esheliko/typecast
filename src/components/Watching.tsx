"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLib } from "./cast/LibState";
import { PersonLink, TitleLink } from "./Modal";
import { keepHistory, useBackClose } from "@/lib/back-layer";
import { img } from "@/lib/img";
import { faceNote, filterFaces, groupFaces, roleLabel, type Face } from "@/lib/roster";
import { factButtons, serializeWatch, WATCH_COOKIE, WATCH_MAX_MS, whereLabel, type Watch } from "@/lib/watching";
import type { Credit, Item } from "@/lib/types";
import type { Answer, AnswerCard } from "@/lib/answer";
import type { PersonBrief, Roster } from "@/lib/roster-data";

type Hit = { key: string; title: string; year: string; ep?: string };

interface Ctx {
  watch: Watch | null;
  start: (it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => void;
  stop: () => void;
  open: () => void;
}
const WatchCtx = createContext<Ctx | null>(null);
const useWatch = () => useContext(WatchCtx);

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
  const [sheet, setSheet] = useState<boolean>(false);
  const save = useCallback((w: Watch | null) => { writeCookie(w); setWatch(w); }, []);

  const start = useCallback((it: Item, runtime: number | null, ep?: { s: number; e: number } | null) => {
    const w: Watch = { key: it.key, type: it.type, id: it.id, title: it.title, year: it.year, poster: it.poster, started: Date.now(), runtime };
    if (it.type === "tv") { w.s = ep?.s || 1; w.e = ep?.e || 1; }
    save(w);
    setSheet(true);
  }, [save]);
  const stop = useCallback(() => { save(null); setSheet(false); }, [save]);
  const open = useCallback(() => setSheet(true), []);

  return (
    <WatchCtx.Provider value={{ watch, start, stop, open }}>
      {children}
      {watch && <WatchBar w={watch} onOpen={() => setSheet(true)} />}
      {watch && sheet && <WhoSheet w={watch} onChange={save} onClose={() => setSheet(false)} onStop={stop} />}
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
        <span className="btn sm gold wbar-ask">Who&rsquo;s that?</span>
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
        <button type="button" className="btn gold" onClick={() => c.open()}><span className="live-dot" aria-hidden="true" />Watching now · Who&rsquo;s that?</button>
      ) : (
        <button type="button" className="btn" onClick={() => c.start(it, runtime, progress)}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
          {c.watch ? "Watch this now instead" : "I’m watching this now"}
        </button>
      )}
      {!mine && <span className="small muted">Recognise a face? Find out who it is and where you know them from.</span>}
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
function FactView({ a, onLeave }: { a: Answer; onLeave: () => void }) {
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

const noPhoto = (name: string) => <span className="wh-noph" aria-hidden="true">{name[0]}</span>;

/** One face in the grid: photo, name, the part they play, where they are in the show, and what you've seen them in. */
function Tile({ f, hit, onPick }: { f: Face; hit?: Hit[]; onPick: () => void }) {
  const role = roleLabel(f.role), note = faceNote(f);
  return (
    <li>
      <button type="button" className="wh-tile" onClick={onPick}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {f.photo ? <img src={img(f.photo, "w185")} alt="" loading="lazy" /> : noPhoto(f.name)}
        <b>{f.name}</b>
        {role && <span className="small muted wh-role">{role}</span>}
        {note && <span className="wh-note">{note}</span>}
        {hit && hit.length > 0 && <span className="ask-seen">You&rsquo;ve seen them in {hit[0].title}{hit[0].ep ? ` (${hit[0].ep})` : ""}{hit.length > 1 ? ` +${hit.length - 1}` : ""}</span>}
      </button>
    </li>
  );
}

const credit = (c: Credit) => ({ key: c.key, title: c.title, year: c.year, poster: c.poster });

/** A list of someone's other work: poster, title, year and part. */
function Works({ label, list, status, onLeave }: { label: string; list: Credit[]; status?: string; onLeave: () => void }) {
  if (!list.length) return null;
  return (
    <section className="wh-works">
      <h3 className="mc-label">{label}</h3>
      <ul>
        {list.map((c) => (
          <li key={c.key}>
            <TitleLink k={c.key} it={credit(c)} className="wh-work" onClick={onLeave}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.poster ? <img src={img(c.poster, "w92")} alt="" loading="lazy" /> : <span className="wh-wph" aria-hidden="true" />}
              <span><b>{c.title}</b> <span className="muted">{c.year}</span>
                <span className="small muted wh-wr">{[c.role && `as ${c.role}`, c.eps ? `${c.eps} ep${c.eps === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</span></span>
              {status && <span className={`ask-st ${status === "On your list" ? "list" : "seen"}`}>{status}</span>}
            </TitleLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything about one person: where they are in this show, what you've seen them in, what they're known for. */
function PersonPanel({ f, w, onBack, onLeave }: { f: Face; w: Watch; onBack: () => void; onLeave: () => void }) {
  const [p, setP] = useState<PersonBrief | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/ask?person=${f.id}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (live) setP(j); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [f.id]);
  const role = roleLabel(f.role);
  const here = f.part === "episode" ? `In this episode${f.count && f.count > 1 ? `, and ${f.count - 1} earlier` : ""}` : f.part === "guest" ? `${f.count && f.count > 1 ? `${f.count} episodes: ${f.first} to ${f.last}` : `Seen in ${f.first}`}` : "";
  return (
    <div className="wh-person">
      <button type="button" className="back" onClick={onBack}><span aria-hidden="true">&#8249;</span> All faces</button>
      <div className="wh-phead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {f.photo ? <img src={img(f.photo, "w185")} alt="" /> : noPhoto(f.name)}
        <div>
          <h2 className="wh-pname">{f.name}</h2>
          {role && <p className="muted" style={{ margin: "2px 0 0" }}>{f.part === "cameo" ? role : `Plays ${role}`} in {w.title}</p>}
          {here && <p className="wh-note" style={{ margin: "4px 0 0" }}>{here}</p>}
          <PersonLink pid={f.id} it={{ name: f.name, photo: f.photo }} className="linkish small" onClick={onLeave}>Open full profile</PersonLink>
        </div>
      </div>
      {!p && !err && <p className="small muted"><span className="spin" />Finding their other work</p>}
      {err && <p className="small muted">Couldn&rsquo;t load their other work. Try again in a moment.</p>}
      {p && (
        <>
          {p.seen.length > 0 ? <Works label="You've seen them in" list={p.seen} status="Seen" onLeave={onLeave} />
            : <p className="small muted">Nothing in your library yet{p.total ? `, but ${p.total} other credits on TMDB` : ""}.</p>}
          <Works label="On your watchlist" list={p.listed} status="On your list" onLeave={onLeave} />
          <Works label="Best known for" list={p.famous} onLeave={onLeave} />
        </>
      )}
    </div>
  );
}


function WhoSheet({ w, onChange, onClose, onStop }: { w: Watch; onChange: (w: Watch) => void; onClose: () => void; onStop: () => void }) {
  const lib = useLib();
  const now = useNow();
  const tv = w.type === "tv";
  const [tab, setTab] = useState<"who" | "about">("who");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [err, setErr] = useState(false);
  const [hits, setHits] = useState<Record<number, Hit[]>>({});
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; people: Face[] } | null>(null);
  const [finding, setFinding] = useState(false);
  const [sel, setSel] = useState<Face | null>(null);
  const [spoilers, setSpoilers] = useState(() => safe(() => localStorage.getItem(SPOIL_KEY) === "1", false));
  const [fact, setFact] = useState<{ label: string; a: Answer | null } | null>(null);
  const [custom, setCustom] = useState("");
  const [ending, setEnding] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const scrollAt = useRef(0);

  useBackClose(true, onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (sel) setSel(null); else onClose(); } };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [onClose, sel]);

  // Who can be on screen at this episode (a film: its whole cast, cameos included).
  const s = w.s ?? 1, e = w.e ?? 1;
  useEffect(() => {
    let live = true;
    setErr(false);
    fetch(`/api/ask${tv ? `?s=${s}&e=${e}` : ""}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: Roster) => { if (live) setRoster(j); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [w.key, tv, s, e]);

  // Then, in the background, which of the first faces the user has already seen elsewhere.
  const groups = roster ? groupFaces(roster.faces, w.type) : [];
  const firstIds = groups.filter((g) => g.id !== "other").flatMap((g) => g.faces).slice(0, 24).map((f) => f.id).join(",");
  useEffect(() => {
    if (!firstIds) return;
    let live = true;
    fetch(`/api/ask?hits=${firstIds}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (live) setHits((h) => ({ ...h, ...j.hits })); }).catch(() => {});
    return () => { live = false; };
  }, [firstIds]);

  const pick = (f: Face) => { scrollAt.current = body.current?.scrollTop ?? 0; setSel(f); body.current?.scrollTo({ top: 0 }); };
  const back = () => { setSel(null); requestAnimationFrame(() => body.current?.scrollTo({ top: scrollAt.current })); };
  const leave = () => { keepHistory(); onClose(); };

  const setEp = (ns: number, ne: number) => onChange({ ...w, s: Math.max(1, ns), e: Math.max(1, ne) });
  const epCount = (n: number) => roster?.seasons.find((x) => x.n === n)?.eps ?? 0;
  const shift = (min: number) => onChange({ ...w, started: Math.min(Date.now(), w.started - min * 60000) });

  const query = q.trim();
  const shown = roster ? filterFaces(roster.faces, query) : [];
  const shownGroups = query ? groupFaces(shown, w.type) : groups.filter((g) => g.id !== "other");
  const search = async () => {
    setFinding(true);
    try {
      const j = await fetch(`/api/ask?find=${encodeURIComponent(query)}`).then((r) => r.json());
      setFound({ q: query, people: (j.people ?? []).map((p: Face) => ({ ...p, part: "other" as const })) });
    } catch { setFound({ q: query, people: [] }); } finally { setFinding(false); }
  };

  const ask = async (label: string, text: string) => {
    setFact({ label, a: null });
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: text, spoilers }) });
      const j = await r.json().catch(() => ({}));
      setFact({ label, a: r.ok && typeof j.text === "string" ? j : { text: j.error ?? `Couldn't look that up (${r.status}). Try again.` } });
    } catch { setFact({ label, a: { text: "Couldn't reach Typecast. Check your connection." } }); }
  };
  const toggleSpoilers = () => { const v = !spoilers; setSpoilers(v); safe(() => localStorage.setItem(SPOIL_KEY, v ? "1" : "0"), undefined); };
  const finish = (watched: boolean) => {
    if (watched) lib.mark({ key: w.key, type: w.type, id: w.id, title: w.title, year: w.year, poster: w.poster }, "watched", undefined, true);
    onStop();
  };

  const kind = tv ? "episode" : "film";
  return (
    <div className="gl-wrap ask-wrap" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="gl ask" role="dialog" aria-modal="true" aria-label={`Who's on screen in ${w.title}`}>
        <div className="gl-bar">
          <div style={{ minWidth: 0 }}>
            <div className="wbar-k"><span className="live-dot" aria-hidden="true" />Watching now</div>
            <b className="gl-h">{w.title}</b>
          </div>
          <button type="button" className="back" onClick={onClose} aria-label="Close"><span aria-hidden="true">&#215;</span> Close</button>
        </div>
        <div className="gl-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "who"} className={tab === "who" ? "on" : ""} onClick={() => setTab("who")}>Who&rsquo;s that?</button>
          <button type="button" role="tab" aria-selected={tab === "about"} className={tab === "about" ? "on" : ""} onClick={() => setTab("about")}>About this {kind}</button>
        </div>

        <div className="gl-body" ref={body}>
          {tab === "who" && sel && <PersonPanel f={sel} w={w} onBack={back} onLeave={leave} />}
          {tab === "who" && !sel && (
            <>
              {tv && (
                <div className="wh-pos">
                  <b>Which episode are they on?</b>
                  <span className="wh-sel">
                    <label>Season <select value={s} onChange={(ev) => setEp(Number(ev.target.value), 1)} aria-label="Season">
                      {(roster?.seasons.length ? roster.seasons : [{ n: s, eps: 0 }]).map((x) => <option key={x.n} value={x.n}>{x.n}</option>)}
                    </select></label>
                    <label>Episode <select value={e} onChange={(ev) => setEp(s, Number(ev.target.value))} aria-label="Episode">
                      {Array.from({ length: Math.max(epCount(s), e) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select></label>
                  </span>
                  <p className="small muted" style={{ margin: "6px 0 0" }}>Only people who have appeared up to S{s} E{e} are shown, so nothing is given away.</p>
                </div>
              )}
              <div className="wh-find">
                <input type="search" value={q} onChange={(ev) => { setQ(ev.target.value); setFound(null); }} placeholder="Search this cast by actor or character" aria-label="Search the cast" enterKeyHint="search" />
              </div>
              {!roster && !err && <p className="small muted"><span className="spin" />Loading who&rsquo;s in it</p>}
              {err && <p className="small muted">Couldn&rsquo;t load the cast. Check your connection and reopen this.</p>}
              {roster?.note && <p className="small muted">{roster.note}</p>}
              {shownGroups.map((g) => (
                <section key={g.id} className="wh-group">
                  <h3 className="wh-gh">{g.label}<span className="muted"> · {g.faces.length}</span></h3>
                  {g.hint && !query && <p className="small muted" style={{ margin: "0 0 8px" }}>{g.hint}</p>}
                  <ul className="wh-grid">{g.faces.map((f) => <Tile key={f.id} f={f} hit={hits[f.id]} onPick={() => pick(f)} />)}</ul>
                </section>
              ))}
              {roster && query && !shown.length && <p className="small muted">No one in this cast matches &ldquo;{query}&rdquo;.</p>}
              {roster && query && (
                <div className="wh-more">
                  {found?.q === query ? (
                    found.people.length ? (
                      <>
                        <h3 className="wh-gh">Actors named &ldquo;{query}&rdquo; <span className="muted">· anywhere</span></h3>
                        <ul className="wh-grid">{found.people.map((f) => <Tile key={f.id} f={f} onPick={() => pick(f)} />)}</ul>
                      </>
                    ) : <p className="small muted">TMDB has nobody by that name.</p>
                  ) : <button type="button" className="btn sm" onClick={search} disabled={finding}>{finding ? "Searching…" : `Search every actor for “${query}”`}</button>}
                </div>
              )}
              {roster && !query && <p className="small muted" style={{ marginTop: 14 }}>Not there? {tv ? "Change the episode above, or t" : "T"}ype a name in the box to search all actors.</p>}
            </>
          )}

          {tab === "about" && (
            <>
              <div className="ask-where">
                {!tv && (
                  <span className="ask-step" role="group" aria-label="How far in">
                    <button type="button" onClick={() => shift(-5)} aria-label="5 minutes less">−5</button>
                    <b>{whereLabel(w, now)}</b>
                    <button type="button" onClick={() => shift(5)} aria-label="5 minutes more">+5</button>
                  </span>
                )}
                {tv && <span className="small muted">Up to S{s} E{e}. Change the episode on the Who&rsquo;s that? tab.</span>}
                <button type="button" className="chip" aria-pressed={spoilers} onClick={toggleSpoilers}>{spoilers ? "Spoilers OK" : "No spoilers"}</button>
              </div>
              <div className="chips ask-chips">
                {factButtons(w.type).map((b) => <button key={b.label} type="button" className="chip" aria-pressed={fact?.label === b.label} onClick={() => ask(b.label, b.q)}>{b.label}</button>)}
              </div>
              {fact && (
                <div className="wh-fact" aria-live="polite">
                  <h3 className="mc-label">{fact.label}</h3>
                  {fact.a ? <FactView a={fact.a} onLeave={leave} /> : <p className="muted" style={{ margin: 0 }}><span className="spin" />Looking it up</p>}
                </div>
              )}
              <form className="wh-custom" onSubmit={(ev) => { ev.preventDefault(); if (custom.trim()) ask(`Search: ${custom.trim()}`, custom.trim()); }}>
                <input type="search" value={custom} onChange={(ev) => setCustom(ev.target.value)} placeholder={`Look something up about ${w.title}`} aria-label="Look something up" enterKeyHint="search" />
                <button type="submit" className="btn sm" disabled={!custom.trim()}>Look up</button>
              </form>
              <p className="small muted" style={{ margin: "6px 0 0" }}>Searches this title&rsquo;s Wikipedia page{spoilers ? "" : ", with plot sections left out"}.</p>
            </>
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
      </div>
    </div>
  );
}
