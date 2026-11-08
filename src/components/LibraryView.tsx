"use client";
import { useState } from "react";
import LibraryList from "./LibraryList";
import UpNext from "./UpNext";
import { useRef } from "react";
import { useRetained } from "@/lib/useRetained";
import { STATUS_LABEL, type LibItem, type Status } from "@/lib/types";

const TABS: [Status | "all", string][] = [["all", "All"], ["watching", STATUS_LABEL.watching], ["partial", STATUS_LABEL.partial], ["watchlist", STATUS_LABEL.watchlist], ["watched", STATUS_LABEL.watched]];

/** The filter chips and the list. Switching chips is instant (no server trip); the URL is kept in step so a refresh or shared link lands on the same filter. */
export default function LibraryView({ items, initial, between }: { items: LibItem[]; initial: Status | "all"; between?: React.ReactNode }) {
  const [filter, setFilter] = useState<Status | "all">(initial);
  const count = (s: Status | "all") => (s === "all" ? items.length : items.filter((l) => l.status === s).length);
  // Rows hold their place while you work: an unmarked title stays (unmarked) so you can mark it again, and a changed one
  // stays in the list it was in. Where a row belongs is fixed when it first appears, and refreshed when you pick a chip.
  const [all, reset] = useRetained(items, "start");
  const where = useRef(new Map<string, { status: Status; must: boolean }>());
  for (const l of all) if (!where.current.has(l.key)) where.current.set(l.key, { status: l.status, must: l.priority === "must" });
  const at = (l: LibItem) => where.current.get(l.key)!;
  const picked = filter === "all" ? all : all.filter((l) => at(l).status === filter);
  const shown = filter === "watchlist" ? [...picked].sort((a, b) => Number(!at(a).must) - Number(!at(b).must)) : picked; // must-watch first (stable sort keeps newest-first)
  function choose(k: Status | "all") {
    reset(); where.current.clear();
    setFilter(k);
    const u = new URL(window.location.href);
    if (k === "all") u.searchParams.delete("f"); else u.searchParams.set("f", k);
    window.history.replaceState(window.history.state, "", u);
  }
  return (
    <>
      <UpNext items={items} />
      <div className="chips" role="group" aria-label="Filter">
        {TABS.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => choose(k)}>{label} <span className="mono">{count(k)}</span></button>)}
      </div>
      {between}
      <LibraryList items={shown} />
    </>
  );
}
