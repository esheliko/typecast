"use client";
import { useCallback, useState } from "react";
import Search from "../Search";
import Browse, { Poster, type BrowseProps } from "./Browse";
import Connect, { type Mode } from "./Connect";
import { LibProvider } from "./LibState";
import type { BrowseItem, Item, Mark, PersonLite } from "@/lib/types";

export type View = "browse" | "connect";
export interface HomeProps {
  marks: Record<string, Mark>;
  view: View;
  browse: BrowseProps;
  connect: { mode: Mode; a: { kind: "person"; p: PersonLite } | { kind: "title"; t: Item } | null };
  /** Titles in progress, with their episode as the subtitle. */
  watching: (BrowseItem & { sub: string })[];
}

export default function CastHome({ marks, view: initialView, browse, connect, watching }: HomeProps) {
  const [view, setView] = useState<View>(initialView);
  const [searching, setSearching] = useState(false);
  const [connectOpened, setConnectOpened] = useState(initialView === "connect");
  const onActive = useCallback((on: boolean) => setSearching(on), []);

  function go(v: View) {
    setView(v);
    if (v === "connect") setConnectOpened(true);
    const u = new URL(window.location.href);
    if (v === "connect") u.searchParams.set("view", "connect"); else u.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", u);
  }

  return (
    <LibProvider initial={marks}>
      <div className="page cast-home">
        <Search onActive={onActive} />
        <div hidden={searching}>
          <div className="views" role="tablist" aria-label="Cast tab">
            <button role="tab" type="button" aria-selected={view === "browse"} onClick={() => go("browse")}>Browse</button>
            <button role="tab" type="button" aria-selected={view === "connect"} onClick={() => go("connect")}>Connections</button>
          </div>
          {/* Both views stay mounted so switching back keeps your place, filters and picks. */}
          <div hidden={view !== "browse"}>
            {watching.length > 0 && !browse.filtered && (
              <>
                <h2>Continue watching</h2>
                <ul className="strip">{watching.map((w) => <li key={w.key}><Poster it={w} sub={w.sub} /></li>)}</ul>
              </>
            )}
            <Browse {...browse} /></div>
          <div hidden={view !== "connect"}>{connectOpened ? <Connect initialMode={connect.mode} initialA={connect.a} /> : null}</div>
        </div>
      </div>
    </LibProvider>
  );
}
