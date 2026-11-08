"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import BrowseFilters from "../BrowseFilters";
import { TitleLink } from "../Modal";
import { GlimpseButton } from "../Glimpse";
import { titleSpec } from "@/lib/glimpse";
import { useLib } from "./LibState";
import PassedCell from "./PassedCell";
import QuickMark from "./QuickMark";
import RelatedButton from "./RelatedButton";
import type { Nudge } from "@/lib/nudges";
import { SORTS, convertGenres, toParams, type BrowseQuery, type Sort, type Tag } from "@/lib/browse";
import { img } from "@/lib/img";
import { faded, loadPassed, type Passed } from "@/lib/passed";
import { STATUS_LABEL, type BrowseItem, type BrowseList, type BrowseType } from "@/lib/types";

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
  genres: Record<BrowseType, Tag[]>;
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
const SNAP = "tc:browse";
interface Snap { url: string; salt: number; list: BrowseList; type: BrowseType; pages: Record<string, Page>; y: number; t: number }

export default function Browse({ filters, filtered, list: initialList, salt: serverSalt, first, genres, canFilterMine }: BrowseProps) {
  const router = useRouter();
  // The "For you" seed. Kept in state (and in a snapshot while a title is open) so coming back never reshuffles the grid.
  const [salt, setSalt] = useState(serverSalt);
  const [routing, startRoute] = useTransition();
  // What the controls show: updated the instant you tap, then settled by the server's props when the transition ends.
  const [shownFilters, setShownFilters] = useOptimistic(filters);
  const navigate = (next: BrowseQuery) => {
    const s = toParams(next).toString();
    startRoute(() => { setShownFilters(next); router.replace(s ? `/?${s}` : "/", { scroll: false }); });
  };
  const [type, setType] = useState<BrowseType>(filters.type);
  const [list, setList] = useState<BrowseList>(initialList);
  const [hide, setHideState] = useState(true);
  const [panel, setPanel] = useState(filtered);
  const key = filtered ? `f:${toParams(filters)}` : `l:${type}/${list}`;

  const [pages, setPages] = useState<Record<string, Page>>(() => (first ? { [key]: first } : {}));
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  // Suggested directions, read off the watched history. Fetched after the grid, kept for the session.
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [nudgeRound, setNudgeRound] = useState(0);
  const [nudgeBusy, setNudgeBusy] = useState(false);
  const loadNudges = (round: number) => {
    setNudgeBusy(true);
    fetch(`/api/nudges?r=${round}`).then((r) => r.json()).then((j) => {
      const items = (j.items ?? []) as Nudge[];
      if (items.length) { setNudges(items); setNudgeRound(round); try { sessionStorage.setItem("tc:nudges", JSON.stringify({ round, items })); } catch { /* ignore */ } }
    }).catch(() => {}).finally(() => setNudgeBusy(false));
  };
  useEffect(() => {
    if (list !== "foryou") return;
    try {
      const c = JSON.parse(sessionStorage.getItem("tc:nudges") || "null");
      if (c && Array.isArray(c.items)) { setNudges(c.items); setNudgeRound(c.round ?? 0); return; }
    } catch { /* ignore */ }
    loadNudges(0);
  }, [list]);
  const seq = useRef(0);
  const { marked, skipped } = useLib();
  const [seen] = useState(() => marked());
  // Titles you looked at on earlier visits and scrolled past without a mark are shown less and less often.
  // Snapshotted once, so what you scroll past now only takes effect on your next visit and the grid never shifts under you.
  // The dice are seeded once per mount, not from the `salt` prop: every mark refreshes the page on the server, which hands
  // down a new salt, and re-rolling then would make passed-over titles pop out of the grid under your thumb.
  const [fadeSeed, setFadeSeed] = useState(serverSalt);
  const [passed, setPassed] = useState<Passed>(() => new Map());
  useLayoutEffect(() => { setPassed(loadPassed()); }, []);
  // Marked and skipped titles are hidden unless you turn that off; the choice is remembered on this device.
  useEffect(() => { try { if (localStorage.getItem("typecast.hide") === "0") setHideState(false); } catch { /* storage unavailable */ } }, []);
  const setHide = (v: boolean) => { setHideState(v); autoRuns.current = 0; try { localStorage.setItem("typecast.hide", v ? "1" : "0"); } catch { /* storage unavailable */ } };
  const autoRuns = useRef(0);

  // Opening a title (popup, or the full page if the popup is bypassed) can rebuild this page on the way back. Snapshot the
  // seed, loaded pages and scroll when a title is tapped, and put them back on the next mount for the same URL.
  const live = useRef({ salt, list, type, pages: {} as Record<string, Page> });
  live.current = { salt, list, type, pages };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.('a[href^="/title/"]')) return;
      const c = live.current;
      const snap: Snap = { url: location.pathname + location.search, salt: c.salt, list: c.list, type: c.type, pages: c.pages, y: window.scrollY, t: Date.now() };
      try { sessionStorage.setItem(SNAP, JSON.stringify(snap)); } catch { /* storage unavailable or full */ }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useLayoutEffect(() => {
    let snap: Snap | null = null;
    try { const raw = sessionStorage.getItem(SNAP); if (raw) { snap = JSON.parse(raw); sessionStorage.removeItem(SNAP); } } catch { /* ignore */ }
    if (!snap || snap.url !== location.pathname + location.search || Date.now() - snap.t > 30 * 60_000) return;
    const s = snap;
    restored.current = true;
    setSalt(s.salt); setFadeSeed(s.salt); setList(s.list); setType(s.type); setPages((p) => ({ ...p, ...s.pages }));
    const t0 = Date.now();
    const step = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= s.y || Date.now() - t0 > 2000) { window.scrollTo({ top: Math.min(s.y, Math.max(room, 0)), behavior: "instant" as ScrollBehavior }); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  // Whenever the grid's content changes (list, type, filters, search or "For you" seed), start again from the top.
  // A snapshot restore is not a content change: it brings its own scroll position back.
  const restored = useRef(false);
  const view = `${key}|${salt}`;
  const lastView = useRef(view);
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    if (restored.current) { restored.current = false; return; }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [view]);

  // Filter changes arrive as new server props: adopt the server's first page and type.
  useEffect(() => { if (first) setPages((p) => (p[key] ? p : { ...p, [key]: first })); }, [key, first]);
  useEffect(() => { setType(filters.type); }, [filters.type]);
  const keepClosed = useRef(false);
  useEffect(() => { if (filtered && !keepClosed.current) setPanel(true); keepClosed.current = false; }, [filtered]);

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
    // Deliberately keyed on `key` only: load/pages/first change on every fetch and must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function setUrl(p: Record<string, string | null>) {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(p)) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); }
    window.history.replaceState(window.history.state, "", u);
  }
  function chooseList(l: BrowseList) {
    setList(l);
    // Picking a list while filters are set drops the filters and shows that list.
    if (filtered) { const q = new URLSearchParams({ list: l }); if (type !== "all") q.set("type", type); startRoute(() => router.replace(`/?${q}`, { scroll: false })); return; }
    setUrl({ list: l });
  }
  function chooseType(t: BrowseType) {
    if (t === type) return;
    // With filters set the server runs the search again. Genre ids differ between films and series, so they are translated.
    if (filtered) { navigate({ ...filters, type: t, genres: convertGenres(filters.genres, type, t) }); return; }
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
  const n = countFilters(shownFilters);
  const vType = filtered ? shownFilters.type : type;

  return (
    <section aria-label="Browse">
      {(
        <div className="chips scroll" role="group" aria-label="List">
          {LISTS.map((l) => <button key={l.k} type="button" className="chip" aria-pressed={!filtered && list === l.k} onClick={() => chooseList(l.k)}>{type === "tv" && l.tv ? l.tv : type === "all" && l.tv ? `${l.label} / ${l.tv}` : l.label}</button>)}
        </div>
      )}
      {list === "foryou" && nudges.length > 0 && (
        <p className="nudge small muted" aria-label="Other directions">
          Try:{" "}
          {nudges.map((d) => (
            <button key={d.id} type="button" className="nudge-b" title={d.why} onClick={() => { keepClosed.current = true; const s = toParams({ ...filters, type, ...d.patch }).toString(); startRoute(() => router.replace(`/?${s}`, { scroll: false })); }}>{d.label}</button>
          ))}
          <button type="button" className="nudge-b" aria-label="Show other suggestions" title="Show other suggestions" disabled={nudgeBusy} onClick={() => loadNudges(nudgeRound + 1)} style={{ opacity: nudgeBusy ? 0.5 : 1 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ verticalAlign: "-2px" }}><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </p>
      )}
      <div className="bz-bar">
        <div className="seg" role="group" aria-label="Type">
          {(["all", "movie", "tv"] as BrowseType[]).map((t) => <button key={t} type="button" aria-pressed={vType === t} onClick={() => chooseType(t)}>{t === "all" ? "Both" : t === "movie" ? "Films" : "Series"}</button>)}
        </div>
        <button type="button" className="chip sm filt" aria-expanded={panel} aria-pressed={n > 0} onClick={() => setPanel(!panel)}>
          <svg className="pill-i" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 5h16l-6 8v6l-4-2v-4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          Filters{n ? ` · ${n}` : ""} <span aria-hidden="true">{panel ? "▴" : "▾"}</span>
        </button>
        <label className="pillsel" title="Sort order">
          <svg className="pill-i" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 4v16m0 0-3-3m3 3 3-3M16 20V4m0 0-3 3m3-3 3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <select aria-label="Sort by" value={shownFilters.sort} onChange={(e) => navigate({ ...filters, type, sort: e.target.value as Sort })}>
            {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button type="button" className="chip sm" aria-pressed={hide} onClick={() => setHide(!hide)} title="Hide titles you have already marked or skipped, and make ones you keep scrolling past turn up less often">Hide marked{hide && hiddenCount > 0 ? ` · ${hiddenCount}` : ""}</button>
      </div>
      {panel && <BrowseFilters q={{ ...shownFilters, type: vType }} genres={genres[vType]} canFilterMine={canFilterMine} active={filtered} pending={routing} onChange={navigate} />}
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
        {s === "watching" && <span className="pc-flag">{STATUS_LABEL.watching}</span>}
        {s === "partial" && <span className="pc-flag partial">{STATUS_LABEL.partial}</span>}
        {skippable && !s && <button type="button" className="pc-x" onClick={() => skip(it)} aria-label={`Not interested in ${it.title}`} title="Not interested"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></button>}
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
