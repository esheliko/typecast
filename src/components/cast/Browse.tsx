"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLib } from "./LibState";
import QuickMark from "./QuickMark";
import { href, img } from "@/lib/img";
import type { BrowseItem, BrowseList, MediaType } from "@/lib/types";

const LISTS: { k: BrowseList; label: string; tv?: string }[] = [
  { k: "trending", label: "Trending" },
  { k: "popular", label: "Popular" },
  { k: "top", label: "Top rated" },
  { k: "new", label: "In cinemas", tv: "On air" },
  { k: "soon", label: "Coming soon" },
];
const GENRES: Record<MediaType, [number, string][]> = {
  movie: [[28, "Action"], [12, "Adventure"], [16, "Animation"], [35, "Comedy"], [80, "Crime"], [99, "Documentary"], [18, "Drama"], [10751, "Family"], [14, "Fantasy"], [36, "History"], [27, "Horror"], [10402, "Music"], [9648, "Mystery"], [10749, "Romance"], [878, "Science fiction"], [53, "Thriller"], [10752, "War"], [37, "Western"]],
  tv: [[10759, "Action & adventure"], [16, "Animation"], [35, "Comedy"], [80, "Crime"], [99, "Documentary"], [18, "Drama"], [10751, "Family"], [10762, "Kids"], [9648, "Mystery"], [10765, "Sci-fi & fantasy"], [10768, "War & politics"], [37, "Western"]],
};

export interface Query { list: BrowseList; type: MediaType; genre: number | null }
interface Page { items: BrowseItem[]; page: number; more: boolean }
const qkey = (q: Query) => `${q.type}/${q.list}/${q.genre ?? ""}`;

/** The browse grid: pick a list, a type and a genre, then mark titles straight from the posters. */
export default function Browse({ initial, first }: { initial: Query; first: Page | null }) {
  const [q, setQ] = useState<Query>(initial);
  const [hide, setHide] = useState(false);
  const cache = useRef(new Map<string, Page>(first ? [[qkey(initial), first]] : []));
  const [data, setData] = useState<Page | null>(first);
  const [state, setState] = useState<"idle" | "loading" | "error">(first ? "idle" : "loading");
  const [error, setError] = useState("");
  const seq = useRef(0);
  const { get } = useLib();

  const load = useCallback(async (query: Query, page: number) => {
    const mine = ++seq.current;
    setState("loading");
    try {
      const u = `/api/browse?list=${query.list}&type=${query.type}&page=${page}${query.genre ? `&genre=${query.genre}` : ""}`;
      const r = await fetch(u); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not load titles.");
      if (mine !== seq.current) return;
      const prev = page > 1 ? cache.current.get(qkey(query)) : undefined;
      const have = new Set(prev?.items.map((i) => i.key));
      const next: Page = { items: [...(prev?.items ?? []), ...(j.items as BrowseItem[]).filter((i) => !have.has(i.key))], page, more: j.more };
      cache.current.set(qkey(query), next);
      setData(next); setState("idle");
    } catch (e) { if (mine === seq.current) { setError((e as Error).message); setState("error"); } }
  }, []);

  function choose(p: Partial<Query>) {
    const next = { ...q, ...p };
    if (p.type && p.type !== q.type) next.genre = null;
    setQ(next);
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries({ type: next.type, list: next.list, genre: next.genre })) { if (v && !(k === "type" && v === "movie") && !(k === "list" && v === "trending")) u.searchParams.set(k, String(v)); else u.searchParams.delete(k); }
    window.history.replaceState(window.history.state, "", u);
    const hit = cache.current.get(qkey(next));
    if (hit) { seq.current++; setData(hit); setState("idle"); } else { setData(null); load(next, 1); }
  }

  // Only on mount: later server re-renders (after a mark is saved) pass new props that must not reset the grid.
  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; if (!first) load(q, 1); }, [first, q, load]);

  // Load the next page when the end of the grid comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const more = useCallback(() => { if (data?.more && state === "idle") load(q, data.page + 1); }, [data, state, q, load]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) more(); }, { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, [more]);

  const shown = (data?.items ?? []).filter((i) => !hide || !get(i.key));
  const hiddenCount = (data?.items.length ?? 0) - shown.length;

  return (
    <section aria-label="Browse">
      <div className="chips scroll" role="group" aria-label="List">
        {LISTS.map((l) => <button key={l.k} type="button" className="chip" aria-pressed={q.list === l.k} onClick={() => choose({ list: l.k })}>{q.type === "tv" && l.tv ? l.tv : l.label}</button>)}
      </div>
      <div className="bz-bar">
        <div className="seg" role="group" aria-label="Type">
          {(["movie", "tv"] as MediaType[]).map((t) => <button key={t} type="button" aria-pressed={q.type === t} onClick={() => choose({ type: t })}>{t === "movie" ? "Films" : "Series"}</button>)}
        </div>
        <select aria-label="Genre" value={q.genre ?? ""} onChange={(e) => choose({ genre: e.target.value ? +e.target.value : null })}>
          <option value="">All genres</option>
          {GENRES[q.type].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <button type="button" className="chip sm" aria-pressed={hide} onClick={() => setHide(!hide)} title="Hide titles you have already marked">Hide marked</button>
      </div>

      {shown.length > 0 && (
        <ul className="grid">
          {shown.map((it) => <li key={it.key}><Poster it={it} /></li>)}
        </ul>
      )}
      {state === "idle" && data && shown.length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>{hiddenCount ? `You have marked all ${hiddenCount} titles loaded so far.` : "Nothing in this list."}</p>
      )}
      {state === "loading" && (data ? <p className="muted center"><span className="spin" />Loading more</p> : <ul className="grid">{Array.from({ length: 12 }, (_, i) => <li key={i}><div className="pc"><div className="pc-img sk" /></div></li>)}</ul>)}
      {state === "error" && <p className="err" style={{ marginTop: 16 }}>{error} <button className="btn sm" onClick={() => load(q, data ? data.page + 1 : 1)}>Try again</button></p>}
      {state === "idle" && data?.more && <div className="center"><button className="btn" onClick={more}>Load more</button></div>}
      <div ref={sentinel} aria-hidden="true" />
    </section>
  );
}

export function Poster({ it, sub }: { it: BrowseItem; sub?: string }) {
  const s = useLib().get(it.key)?.status;
  return (
    <div className={`pc${s ? ` is-${s}` : ""}`}>
      <div className="pc-art">
        <Link href={href(it.key)} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {it.poster ? <img className="pc-img" src={img(it.poster, "w342")} alt="" loading="lazy" /> : <span className="pc-img ph"><span>{it.title}</span></span>}
        </Link>
        {s === "watching" && <span className="pc-flag">Watching</span>}
        <QuickMark it={it} />
      </div>
      <Link href={href(it.key)} className="pc-link">
        <span className="pc-t">{it.title}</span>
        <span className="pc-s">{sub ?? [it.year, it.vote ? `★ ${it.vote.toFixed(1)}` : ""].filter(Boolean).join(" · ")}</span>
      </Link>
    </div>
  );
}
