"use client";
import { useRef, useState } from "react";
import { TitleRow } from "../ui";
import MarkRow from "./MarkRow";
import { KindFilter } from "../KindSeg";
import { useLib } from "./LibState";
import { useRetained } from "@/lib/useRetained";
import { creditSub } from "@/lib/episodes";
import type { Item, Status } from "@/lib/types";

export type CreditItem = Item & { role?: string; votes?: number; rating?: number; date?: string; eps?: number; since?: string };

type Sort = "release" | "rating" | "alpha" | "relevance";
const SORTS: { value: Sort; label: string }[] = [
  { value: "release", label: "Release date" },
  { value: "rating", label: "Rating" },
  { value: "alpha", label: "A–Z" },
  { value: "relevance", label: "Relevance to me" },
];
/** Rating pulled toward the average when few people voted, so a 10.0 from three votes does not top the list. */
const score = (k: CreditItem) => { const v = k.votes ?? 0, m = 300; return (v / (v + m)) * (k.rating ?? 0) + (m / (v + m)) * 6.5; };
/** How much a title in your library matters right now: queued and in-progress titles first, then ones you rated high. */
const STATUS_W: Record<Status, number> = { watching: 5, watchlist: 4, partial: 3, watched: 1 };
function sorted(list: CreditItem[], sort: Sort, rel: Map<string, number>): CreditItem[] {
  const by = (f: (a: CreditItem, b: CreditItem) => number) => [...list].sort((a, b) => f(a, b) || (b.votes ?? 0) - (a.votes ?? 0));
  switch (sort) {
    case "release": return by((a, b) => (b.date || b.year ? 1 : 0) - (a.date || a.year ? 1 : 0) || (b.date || b.year).localeCompare(a.date || a.year));
    case "rating": return by((a, b) => score(b) - score(a));
    case "alpha": return by((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "relevance": return by((a, b) => (rel.get(b.key) ?? 0) - (rel.get(a.key) ?? 0));
  }
}

/**
 * The person's filmography: "In your library" first, then "Known for". Which section a title is in is decided when the page
 * opens, so unmarking something does not send it to the other section. Each section is sorted by release date (newest first)
 * unless you pick another order. "Known for" is the 30 best-known titles (or all, via "Show all"), then sorted.
 */
export default function PersonCredits({ known, mineKeys }: { known: CreditItem[]; mineKeys: string[] }) {
  const { get } = useLib();
  const [sort, setSort] = useState<Sort>("release");
  const [kind, setKind] = useState<"all" | "movie" | "tv">("all");
  const split = useRef<Set<string> | null>(null);
  split.current ??= new Set(mineKeys);
  /** Relevance is taken when the page opens too, so marking a title does not make rows jump. */
  const rel = useRef<Map<string, number> | null>(null);
  rel.current ??= new Map(known.filter((k) => split.current!.has(k.key)).map((k) => {
    const m = get(k.key);
    return [k.key, m ? STATUS_W[m.status] * 10 + (m.priority === "must" ? 5 : 0) : 0];
  }));
  const shown = kind === "all" ? known : known.filter((k) => k.type === kind);
  const mine = sorted(shown.filter((k) => split.current!.has(k.key)), sort, rel.current);
  const restAll = shown.filter((k) => !split.current!.has(k.key));
  const [all, setAll] = useState(false);
  const rest = sorted(all ? restAll : restAll.slice(0, 30), sort, rel.current);
  const [mineStable, resetMine] = useRetained(mine);
  const [restStable, resetRest] = useRetained(rest);
  const rows = (list: CreditItem[]) => <div className="card"><ul className="rows">{list.map((k) => <li key={k.key}><TitleRow it={k} sub={creditSub(k.role ?? "", k.eps, k.since, k.date)} small /></li>)}</ul></div>;
  return (
    <>
      <div className="inline" style={{ marginTop: 18, alignItems: "center", gap: 8 }}>
        <label className="l" htmlFor="p-sort" style={{ margin: 0 }}>Sort by</label>
        <select id="p-sort" value={sort} onChange={(e) => { resetMine(); resetRest(); setSort(e.target.value as Sort); }}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label className="l" htmlFor="p-kind" style={{ margin: "0 0 0 8px" }}>Show</label>
        <select id="p-kind" value={kind} onChange={(e) => { resetMine(); resetRest(); setKind(e.target.value as typeof kind); }}>
          <option value="all">Films &amp; shows</option>
          <option value="movie">Films</option>
          <option value="tv">Shows</option>
        </select>
      </div>
      {mineStable.length > 0 && <><h2>In your library</h2>{rows(mineStable)}</>}
      <h2>Known for</h2>
      {restStable.length ? rows(restStable) : <p className="small muted">Nothing here.</p>}
      {!all && restAll.length > 30 && <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={() => setAll(true)}>Show all {restAll.length} titles</button>}
    </>
  );
}

/** Suggestion rows that stay put when you mark one (the server list drops marked titles; the row stays so you can undo it in place). */
export function SuggestionRows({ items }: { items: (Item & { why: string })[] }) {
  const [list] = useRetained(items);
  return <KindFilter items={list}>{(shown) => <div className="card"><ul className="rows">{shown.map((k) => <li key={k.key}><TitleRow it={k} sub={k.why} small /></li>)}</ul></div>}</KindFilter>;
}

/** "You know them from" line. Titles you unmark stay named until the page reloads, so the rows below do not shift. */
export function SeenLine({ hits }: { hits: { key: string; title: string; year?: string | number; ep?: string }[] }) {
  const [list] = useRetained(hits);
  if (!list.length) return null;
  // A series names the episode you saw them in: "Breaking Bad (S4 E13 “Face Off”)".
  return <div className="seen">You know them from: {list.slice(0, 4).map((h) => (h.ep ? `${h.title} (${h.ep})` : h.year ? `${h.title} (${h.year})` : h.title)).join(", ")}</div>;
}

/** Library titles that share cast with the open title. Same rule: rows stay put when unmarked. */
export function LinkedRows({ items }: { items: (Item & { sub: string })[] }) {
  const [list] = useRetained(items);
  return <KindFilter items={list}>{(shown) => <div className="card"><ul className="rows">{shown.map((k) => <li key={k.key}><MarkRow it={k} sub={k.sub} small /></li>)}</ul></div>}</KindFilter>;
}

/** The title's Related list. */
export function RelatedRows({ items }: { items: (Item & { rel?: string })[] }) {
  return <KindFilter items={items}>{(shown) => <div className="card"><ul className="rows">{shown.map((r) => <li key={r.key}><MarkRow it={r} sub={r.rel} small /></li>)}</ul></div>}</KindFilter>;
}

/**
 * A cast member's best-known other credits, inside their row on a title. Titles you have watched come first (then the rest in
 * TMDB's order). A title's place is decided the first time it is shown, so marking one never makes the rows jump.
 */
export function TopCredits({ items, actor }: { items: (Item & { role?: string; eps?: number })[]; actor: string }) {
  const { get } = useLib();
  const rank = useRef<Map<string, number>>(new Map());
  for (const k of items) if (!rank.current.has(k.key)) rank.current.set(k.key, get(k.key)?.status === "watched" ? 0 : 1);
  const ordered = items.map((k, i) => [k, i] as const).sort((a, b) => rank.current.get(a[0].key)! - rank.current.get(b[0].key)! || a[1] - b[1]).map(([k]) => k);
  return <KindFilter items={ordered} style={{ margin: "4px 0" }}>{(shown) => shown.map((k) => <MarkRow key={k.key} it={k} sub={k.role} extra={k.eps ? `${k.eps} ep${k.eps === 1 ? "" : "s"}` : undefined} actor={actor} small />)}</KindFilter>;
}
