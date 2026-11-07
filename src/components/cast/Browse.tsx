"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import BrowseFilters from "../BrowseFilters";
import { TitleLink } from "../Modal";
import { GlimpseButton } from "../Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useLib } from "./LibState";
import PassedCell from "./PassedCell";
import QuickMark from "./QuickMark";
import RelatedButton from "./RelatedButton";
import { toParams, type BrowseQuery, type Tag } from "@/lib/browse";
import { img } from "@/lib/img";
import { faded, loadPassed, type Passed } from "@/lib/passed";
import type { BrowseItem, BrowseList, BrowseType, MediaType } from "@/lib/types";

const LISTS: { k: BrowseList; label: string; tv?: string }[] = [
  { k: "foryou", label: "For you" },
  { k: "trending", label: "Trending" },
  { k: "popular", label: "Popular" },
  { k: "top", label: "Top rated" },
  { k: "new", label: "In cinemas", tv: "On air" },
  { k: "soon", label: "Coming soon" },
];

export interface Page { items: BrowseItem[]; page: number; more: boolean; notice?: string }
export interface BrowseProps {
  /** Filters from the URL (genres, years, people, studios, themes, sort, rating, my services). */
  filters: BrowseQuery;
  /** True when any filter beyond Films / Series is set: the grid then shows filtered results instead of a quick list. */
  filtered: boolean;
  list: BrowseList;
  /** Seeds the "For you" picks, so every page of one visit comes from the same set. */
  salt: number;
  /** First page from the server: of the filtered results when filtered, otherwise of the quick list. */
  first: Page | null;
  genres: Record<MediaType, Tag[]>;
  canFilterMine: boolean;
}

/** Number of filters set, not counting Films / Series. */
function countFilters(q: BrowseQuery) {
  return q.genres.length + (q.from || q.to ? 1 : 0) + q.people.length + q.companies.length + q.keywords.length + (q.sort !== "popular" ? 1 : 0) + (q.minRating ? 1 : 0) + (q.mine ? 1 : 0);
}

/**
 * The browse grid. Quick lists (Trending, Popular…) switch instantly on the client; detailed filters go through the URL
 * and the server. Either way every poster has one-tap Watched / To watch, and the grid keeps loading as you scroll.
 */
export default function Browse({ filters, filtered, list: initialList, salt, first, genres, canFilterMine }: BrowseProps) {
  const router = useRouter();
  const [routing, startRoute] = useTransition();
  const [type, setType] = useState<BrowseType>(filters.type);
  const [list, setList] = useState<BrowseList>(initialList);
  const [hide, setHideState] = useState(true);
  const [panel, setPanel] = useState(filtered);
  const key = filtered ? `f:${toParams(filters)}` : `l:${type}/${list}`;

  const [pages, setPages] = useState<Record<string, Page>>(() => (first ? { [key]: first } : {}));
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const seq = useRef(0);
  const { marked, skipped } = useLib();
  const [seen] = useState(() => marked());
  // Titles you looked at on earlier visits and scrolled past without a mark are shown less and less often.
  // Snapshotted once, so what you scroll past now only takes effect on your next visit and the grid never shifts under you.
  // The dice are seeded once per mount, not from the `salt` prop: every mark refreshes the page on the server, which hands
  // down a new salt, and re-rolling then would make passed-over titles pop out of the grid under your thumb.
  const [fadeSeed] = useState(salt);
  const [passed, setPassed] = useState<Passed>(() => new Map());
  useLayoutEffect(() => { setPassed(loadPassed()); }, []);
  // Marked and skipped titles are hidden unless you turn that off; the choice is remembered on this device.
  useEffect(() => { try { if (localStorage.getItem("typecast.hide") === "0") setHideState(false); } catch { /* storage unavailable */ } }, []);
  const setHide = (v: boolean) => { setHideState(v); autoRuns.current = 0; try { localStorage.setItem("typecast.hide", v ? "1" : "0"); } catch { /* storage unavailable */ } };
  const autoRuns = useRef(0);

  // Filter changes arrive as new server props: adopt the server's first page and type.
  useEffect(() => { if (first) setPages((p) => (p[key] ? p : { ...p, [key]: first })); }, [key, first]);
  useEffect(() => { setType(filters.type); }, [filters.type]);
  useEffect(() => { if (filtered) setPanel(true); }, [filtered]);

  const url = useCallback((page: number) => filtered
    ? `/api/discover?${toParams(filters)}&page=${page}`
    : `/api/browse?list=${list}&type=${type}&page=${page}&salt=${salt}`, [filtered, filters, list, type, salt]);

  const load = useCallback(async (page: number) => {
    const mine = ++seq.current; const k = key;
    setState("loading");
    try {
      const r = await fetch(url(page)); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not load titles.");
      if (mine !== seq.current) return;
      const more = "more" in j ? j.more : j.page < j.totalPages;
      setPages((p) => {
        const prev = page > 1 ? p[k] : undefined;
        const have = new Set(prev?.items.map((i) => i.key));
        return { ...p, [k]: { items: [...(prev?.items ?? []), ...(j.items as BrowseItem[]).filter((i) => !have.has(i.key))], page, more, notice: j.notice ?? prev?.notice } };
      });
      setState("idle");
    } catch (e) { if (mine === seq.current) { setError((e as Error).message); setState("error"); } }
  }, [key, url]);

  const data = pages[key] ?? (filtered ? first : null);
  // Load a quick list the first time it is picked; filtered results come from the server.
  useEffect(() => {
    if (!pages[key] && !(filtered && first)) load(1);
    else { seq.current++; setState("idle"); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  function setUrl(p: Record<string, string | null>) {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(p)) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); }
    window.history.replaceState(window.history.state, "", u);
  }
  function chooseList(l: BrowseList) { setList(l); setUrl({ list: l }); }
  function chooseType(t: BrowseType) {
    if (t === type) return;
    // With filters set the server runs the search again. Genre ids differ between films and series, so they reset.
    if (filtered) { const s = toParams({ ...filters, type: t, genres: [] }).toString(); startRoute(() => router.replace(s ? `/?${s}` : "/", { scroll: false })); return; }
    setType(t); setUrl({ type: t === "all" ? null : t });
  }

  const sentinel = useRef<HTMLDivElement>(null);
  const more = useCallback(() => { if (data?.more && state === "idle") load(data.page + 1); }, [data, state, load]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) more(); }, { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, [more]);

  const shown = (data?.items ?? []).filter((i) => !hide || !(seen.has(i.key) || skipped.has(i.key) || faded(passed, i.key, fadeSeed)));
  const hiddenCount = (data?.items.length ?? 0) - shown.length;

  // Hidden titles leave gaps, so keep fetching until the screen is full (a few pages at most, then the scroll takes over).
  useEffect(() => { autoRuns.current = 0; }, [key]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !el.offsetParent || !data?.more || state !== "idle" || autoRuns.current >= 8) return;
    if (el.getBoundingClientRect().top < window.innerHeight + 600) { autoRuns.current++; load(data.page + 1); }
  }, [data, state, shown.length, load]);
  const n = countFilters(filters);

  return (
    <section aria-label="Browse">
      {!filtered && (
        <div className="chips scroll" role="group" aria-label="List">
          {LISTS.map((l) => <button key={l.k} type="button" className="chip" aria-pressed={list === l.k} onClick={() => chooseList(l.k)}>{type === "tv" && l.tv ? l.tv : type === "all" && l.tv ? `${l.label} / ${l.tv}` : l.label}</button>)}
        </div>
      )}
      <div className="bz-bar">
        <div className="seg" role="group" aria-label="Type">
          {(["all", "movie", "tv"] as BrowseType[]).map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => chooseType(t)}>{t === "all" ? "Both" : t === "movie" ? "Films" : "Series"}</button>)}
        </div>
        <button type="button" className="chip sm filt" aria-expanded={panel} aria-pressed={n > 0} onClick={() => setPanel(!panel)}>
          Filters{n ? ` · ${n}` : ""} <span aria-hidden="true">{panel ? "▴" : "▾"}</span>
        </button>
        <button type="button" className="chip sm" aria-pressed={hide} onClick={() => setHide(!hide)} title="Hide titles you have already marked or skipped, and make ones you keep scrolling past turn up less often">Hide marked{hide && hiddenCount > 0 ? ` · ${hiddenCount}` : ""}</button>
      </div>
      {panel && <BrowseFilters q={{ ...filters, type }} genres={type === "all" ? [] : genres[type]} canFilterMine={canFilterMine} active={filtered} />}
      {filtered && <h2>{routing ? <span><span className="spin" />Updating</span> : "Filtered results"}</h2>}
      {data?.notice && <p className="small muted" style={{ margin: "8px 0 0" }}>{data.notice}</p>}

      {shown.length > 0 && <ul className="grid">{shown.map((it) => <PassedCell key={it.key} k={it.key} track={hide}><Poster it={it} skippable /></PassedCell>)}</ul>}
      {state === "idle" && data && shown.length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>{hiddenCount ? `You have already marked, skipped or passed over all ${hiddenCount} titles loaded so far.` : filtered ? "Nothing matches those filters. Try removing one." : "Nothing in this list."}</p>
      )}
      {state === "loading" && (data ? <p className="muted center"><span className="spin" />Loading more</p> : <ul className="grid">{Array.from({ length: 12 }, (_, i) => <li key={i}><div className="pc"><div className="pc-img sk" /></div></li>)}</ul>)}
      {state === "error" && <p className="err" style={{ marginTop: 16 }}>{error} <button className="btn sm" onClick={() => load(data ? data.page + 1 : 1)}>Try again</button></p>}
      {state === "idle" && data?.more && <div className="center"><button className="btn" onClick={more}>Load more</button></div>}
      <div ref={sentinel} aria-hidden="true" />
    </section>
  );
}

function KindIcon({ type }: { type: string }) {
  const tv = type === "tv", label = tv ? "Series" : "Film";
  return (
    <svg className="kind-i" viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      {tv ? <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="m8 2 4 5 4-5" /></> : <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>}
    </svg>
  );
}

export function Poster({ it, sub, skippable }: { it: BrowseItem; sub?: string; skippable?: boolean }) {
  const { get, skip } = useLib();
  const s = get(it.key)?.status;
  return (
    <div className={`pc${s ? ` is-${s}` : ""}`}>
      <div className="pc-art">
        <TitleLink k={it.key} it={it} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {it.poster ? <img className="pc-img" src={img(it.poster, "w342")} alt="" loading="lazy" decoding="async" /> : <span className="pc-img ph"><span>{it.title}</span></span>}
        </TitleLink>
        {s === "watching" && <span className="pc-flag">Watching</span>}
        {s === "partial" && <span className="pc-flag partial">Partly watched</span>}
        {skippable && !s && <button type="button" className="pc-x" onClick={() => skip(it)} aria-label={`Not interested in ${it.title}`} title="Not interested">×</button>}
        <QuickMark it={it} />
        <RelatedButton it={it} />
      </div>
      <span className="pc-gl"><GlimpseButton spec={titleSpec(it)} /></span>
      <TitleLink k={it.key} it={it} className="pc-link">
        <span className="pc-t">{it.title}</span>
        <span className="pc-s"><KindIcon type={it.type} />{sub ?? [it.year || "TBA", it.rating ? `★ ${it.rating.toFixed(1)}` : ""].filter(Boolean).join(" · ")}</span>
      </TitleLink>
    </div>
  );
}
