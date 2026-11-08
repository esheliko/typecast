"use client";
import { PersonLink, TitleLink } from "./Modal";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Avatar } from "./ui";
import { Poster } from "./cast/Browse";
import QuickMark from "./cast/QuickMark";
import { useLib } from "./cast/LibState";
import { KindFilter } from "./KindSeg";
import { img } from "@/lib/img";
import { layoutSearch, youKnowFrom, type PersonHit, type TitleHit } from "@/lib/search-intent";
import type { SearchHit } from "@/lib/types";

const RECENT = "tc:recent-searches";
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : []; } catch { return []; } };
const writeRecent = (v: string[]) => { try { localStorage.setItem(RECENT, JSON.stringify(v)); } catch { /* private mode: no recents */ } };

/** Search box for the cast tab. While it has a query, its results take the place of the page below it. */
export default function Search({ onActive }: { onActive: (on: boolean) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [fix, setFix] = useState<string | null>(null);
  const [exact, setExact] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [showFolded, setShowFolded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const term = q.trim();
  const { get } = useLib();

  useEffect(() => { onActive(term.length >= 2); }, [term, onActive]);
  useEffect(() => { setRecent(readRecent()); }, []);
  useEffect(() => {
    if (term.length < 2) { setHits(null); setFix(null); setState("idle"); return; }
    const ctl = new AbortController();
    setState("loading");
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}${exact ? "&exact=1" : ""}`, { signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Search failed.");
        setHits(j.hits); setFix(j.didYouMean ?? null); setShowFolded(false); setState("idle");
      } catch (e) { if ((e as Error).name !== "AbortError") { setError((e as Error).message); setState("error"); } }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term, exact]);

  // "/" focuses search from anywhere on the page, as on most sites.
  useEffect(() => {
    const k = (e: KeyboardEvent | globalThis.KeyboardEvent) => { if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea,select")) { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  // Decided once when a result set arrives, so marking a title here never makes the list jump around.
  const getRef = useRef(get);
  getRef.current = get;
  const lay = useMemo(() => (hits ? layoutSearch(fix ?? term, hits, (k) => getRef.current(k)) : null), [hits, fix, term]);
  const top = lay?.top ?? null;
  const known = useMemo(() => (top?.kind === "person" ? youKnowFrom(top, (k) => getRef.current(k)) : []), [top]);

  const links = useCallback(() => Array.from(box.current?.querySelectorAll<HTMLAnchorElement>('a[href^="/title/"]:not([tabindex="-1"]), a[href^="/person/"]') ?? []), []);
  const remember = () => { if (term.length < 2) return; const next = [term, ...readRecent().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 6); writeRecent(next); setRecent(next); };
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { if (q) setQ(""); else input.current?.blur(); }
    else if (e.key === "ArrowDown") { const first = links()[0]; if (first) { e.preventDefault(); first.focus(); } }
  };
  const onResultsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const all = links(), i = all.indexOf(a as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) input.current?.focus(); else all[Math.min(all.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };
  const submit = () => {
    // Enter opens the top result when there is a clear one; otherwise it just closes the phone keyboard, as before.
    const first = box.current?.querySelector<HTMLAnchorElement>("[data-top] a[href]");
    if (first) { remember(); first.click(); } else input.current?.blur();
  };

  const people = lay?.people ?? [];
  const summary = !lay ? "" : `${hits?.length ?? 0} results${top ? `, top result ${top.kind === "person" ? top.name : top.title}` : ""}`;
  const recents = focused && !q && recent.length > 0;
  return (
    <>
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="field">
          <input ref={input} type="search" aria-label="Search films, series and people" placeholder="Search a film, series or person" value={q}
            onChange={(e) => { setQ(e.target.value); setExact(false); }} onKeyDown={onInputKey} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} enterKeyHint="search" autoComplete="off" />
        </div>
        {recents && (
          <div className="recent" onMouseDown={(e) => e.preventDefault()}>
            <span className="row-sub">Recent</span>
            {recent.map((r) => <button key={r} type="button" className="chip" onClick={() => { setQ(r); setExact(false); }}>{r}</button>)}
            <button type="button" className="chip sm" onClick={() => { writeRecent([]); setRecent([]); }}>Clear</button>
          </div>
        )}
      </form>
      {term.length >= 2 && (
        <div className="results" ref={box} onKeyDown={onResultsKey} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) remember(); }}>
          <p className="sr-only" role="status" aria-live="polite">{state === "idle" ? summary : ""}</p>
          {state === "loading" && !hits && <p className="muted" style={{ marginTop: 20 }}><span className="spin" />Searching</p>}
          {state === "error" && <p className="err" style={{ marginTop: 20 }}>{error}</p>}
          {hits && state !== "error" && (
            <div style={{ opacity: state === "loading" ? 0.55 : 1, transition: "opacity .15s" }}>
              {fix && <p className="muted" style={{ marginTop: 16 }}>Showing results for <b>{fix}</b>. <button type="button" className="linkish" onClick={() => setExact(true)}>Search for &quot;{term}&quot; instead</button></p>}
              {hits.length === 0 && <p className="muted" style={{ marginTop: 20 }}>Nothing found for &quot;{term}&quot;. Try the full name or add the year.</p>}
              {top && (
                <>
                  <h2>Top result</h2>
                  <TopRow hit={top} known={known} />
                </>
              )}
              {lay?.also && (
                <>
                  <h2>Also</h2>
                  <TopRow hit={lay.also} known={lay.also.kind === "person" ? youKnowFrom(lay.also, (k) => getRef.current(k)) : []} />
                </>
              )}
              {people.length > 0 && (
                <>
                  <h2>{lay?.intent === "person" ? `Also named ${term}` : "People"}</h2>
                  <PeopleStrip people={people} />
                </>
              )}
              {lay && lay.titles.length > 0 && (
                <>
                  <h2>{top ? "More titles" : "Films and series"}</h2>
                  <KindFilter items={lay.titles}>{(shown) => <ul className="grid">{shown.map((h) => <li key={h.key}><Poster it={h} /></li>)}</ul>}</KindFilter>
                </>
              )}
              {lay && lay.folded.length > 0 && (
                showFolded
                  ? <><h2>Weaker matches</h2><KindFilter items={lay.folded}>{(shown) => <ul className="grid">{shown.map((h) => <li key={h.key}><Poster it={h} /></li>)}</ul>}</KindFilter></>
                  : <div className="center" style={{ marginTop: 16 }}><button type="button" className="btn" onClick={() => setShowFolded(true)}>{lay.folded.length} weaker {lay.folded.length === 1 ? "match" : "matches"}</button></div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PeopleStrip({ people }: { people: PersonHit[] }) {
  return (
    <div className="chips scroll people">
      {people.map((h) => (
        <PersonLink key={h.id} className="person-chip" pid={h.id} it={h}>
          <Avatar photo={h.photo} name={h.name} />
          <span><span className="nm">{h.name}</span><span className="row-sub">{h.knownFor.slice(0, 2).join(", ") || h.dept}</span></span>
        </PersonLink>
      ))}
    </div>
  );
}

/** One plain row for the best match: a person (with what you know them from) or a title (with its quick marks). */
function TopRow({ hit, known }: { hit: SearchHit; known: string[] }) {
  if (hit.kind === "person") {
    return (
      <div className="top-row" data-top="">
        <PersonLink className="top-main" pid={hit.id} it={hit}>
          <Avatar photo={hit.photo} name={hit.name} />
          <span className="top-text">
            <span className="nm">{hit.name}</span>
            <span className="row-sub">{hit.dept || "Person"}</span>
            {known.length > 0 ? <span className="row-sub know">You know them from {known.join(", ")}</span> : hit.knownFor.length > 0 && <span className="row-sub">{hit.knownFor.join(", ")}</span>}
          </span>
        </PersonLink>
      </div>
    );
  }
  const t: TitleHit = hit;
  return (
    <div className="top-row" data-top="">
      <TitleLink className="top-main" k={t.key} it={t}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {t.poster ? <img className="top-poster" src={img(t.poster, "w154")} alt="" decoding="async" /> : <span className="top-poster ph" />}
        <span className="top-text">
          <span className="nm">{t.title}</span>
          <span className="row-sub">{[t.type === "tv" ? "Series" : "Film", t.year || "TBA", t.rating ? `★ ${t.rating.toFixed(1)}` : ""].filter(Boolean).join(" · ")}</span>
        </span>
      </TitleLink>
      <QuickMark it={t} variant="inline" />
    </div>
  );
}
