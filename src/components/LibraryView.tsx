"use client";
import { useState } from "react";
import LibraryList from "./LibraryList";
import UpNext from "./UpNext";
import { useRef } from "react";
import { useRetained } from "@/lib/useRetained";
import { STATUS_LABEL, type LibItem, type Status } from "@/lib/types";

const TABS: [Status | "all", string][] = [["all", "All"], ["watching", STATUS_LABEL.watching], ["partial", STATUS_LABEL.partial], ["watchlist", STATUS_LABEL.watchlist], ["watched", STATUS_LABEL.watched]];

const SORTS = [["added", "Recently added"], ["title", "Title A–Z"], ["year", "Year, newest"], ["yearOld", "Year, oldest"], ["rating", "My rating"], ["watched", "Recently watched"]] as const;
export type SortKey = (typeof SORTS)[number][0];
export const isSort = (s: string | undefined): s is SortKey => SORTS.some(([k]) => k === s);
const num = (y: string) => parseInt(y, 10) || 0;
const SORTERS: Record<SortKey, ((a: LibItem, b: LibItem) => number) | null> = {
  added: null, // the library arrives newest-first
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
  year: (a, b) => num(b.year) - num(a.year),
  yearOld: (a, b) => (num(a.year) || 9999) - (num(b.year) || 9999),
  rating: (a, b) => b.rating - a.rating,
  watched: (a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0),
};

/** The filter chips and the list. Switching chips is instant (no server trip); the URL is kept in step so a refresh or shared link lands on the same filter. */
export default function LibraryView({ items, initial, initialSort = "added", between }: { items: LibItem[]; initial: Status | "all"; initialSort?: SortKey; between?: React.ReactNode }) {
  const [filter, setFilter] = useState<Status | "all">(initial);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const count = (s: Status | "all") => (s === "all" ? items.length : items.filter((l) => l.status === s).length);
  // Rows hold their place while you work: an unmarked title stays (unmarked) so you can mark it again, and a changed one
  // stays in the list it was in. Where a row belongs is fixed when it first appears, and refreshed when you pick a chip.
  const [all, reset] = useRetained(items, "start");
  const where = useRef(new Map<string, { status: Status; must: boolean }>());
  for (const l of all) if (!where.current.has(l.key)) where.current.set(l.key, { status: l.status, must: l.priority === "must" });
  const at = (l: LibItem) => where.current.get(l.key)!;
  const picked = filter === "all" ? all : all.filter((l) => at(l).status === filter);
  const by = SORTERS[sort];
  const sorted = by ? [...picked].sort(by) : picked; // stable, so ties keep newest-first
  const shown = filter === "watchlist" && !by ? [...sorted].sort((a, b) => Number(!at(a).must) - Number(!at(b).must)) : sorted; // default order puts must-watch first
  function choose(k: Status | "all") {
    reset(); where.current.clear();
    setFilter(k);
    const u = new URL(window.location.href);
    if (k === "all") u.searchParams.delete("f"); else u.searchParams.set("f", k);
    window.history.replaceState(window.history.state, "", u);
  }
  function chooseSort(k: SortKey) {
    setSort(k);
    const u = new URL(window.location.href);
    if (k === "added") u.searchParams.delete("s"); else u.searchParams.set("s", k);
    window.history.replaceState(window.history.state, "", u);
  }
  return (
    <>
      <UpNext items={items} />
      <div className="chips" role="group" aria-label="Filter">
        {TABS.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => choose(k)}>{label} <span className="mono">{count(k)}</span></button>)}
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <select aria-label="Sort library" value={sort} onChange={(e) => chooseSort(e.target.value as SortKey)}>
          {SORTS.map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
        </select>
      </div>
      {between}
      <LibraryList items={shown} />
    </>
  );
}
