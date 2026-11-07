"use client";
import { useCallback, useEffect, useState } from "react";
import Search from "../Search";
import Browse, { Poster, type BrowseProps } from "./Browse";
import Connect, { type Mode } from "./Connect";
import type { BrowseItem, Item, PersonLite } from "@/lib/types";

export type View = "browse" | "connect";
export interface HomeProps {
  view: View;
  browse: BrowseProps;
  connect: { mode: Mode; a: { kind: "person"; p: PersonLite } | { kind: "title"; t: Item } | null };
  /** Titles in progress, with their episode as the subtitle. */
  watching: (BrowseItem & { sub: string })[];
}

export default function CastHome({ view: initialView, browse, connect, watching }: HomeProps) {
  const [view, setView] = useState<View>(initialView);
  const [searching, setSearching] = useState(false);
  const [connectOpened, setConnectOpened] = useState(initialView === "connect");
  const onActive = useCallback((on: boolean) => setSearching(on), []);

  // The title popup can link back here (Compare this cast…) while this page stays mounted, so follow new links in.
  const aKey = connect.a ? (connect.a.kind === "person" ? `p${connect.a.p.id}` : connect.a.t.key) : "";
  useEffect(() => { if (initialView === "connect") { setView("connect"); setConnectOpened(true); } }, [initialView, aKey]);

  function go(v: View) {
    setView(v);
    if (v === "connect") setConnectOpened(true);
    const u = new URL(window.location.href);
    if (v === "connect") u.searchParams.set("view", "connect"); else u.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", u);
  }

  return (
    <>
      <div className="page cast-home">
        <Search onActive={onActive} />
        <div hidden={searching}>
          <div className="views" role="tablist" aria-label="Browse tab">
            <button role="tab" type="button" aria-selected={view === "browse"} onClick={() => go("browse")}>Browse</button>
            <button role="tab" type="button" aria-selected={view === "connect"} onClick={() => go("connect")}>Connections</button>
          </div>
          {/* Both views stay mounted so switching back keeps your place, filters and picks. */}
          <div hidden={view !== "browse"}>
            {!browse.filtered && (
              <details className="cw">
                <summary>Continue watching{watching.length > 0 && <span className="cw-n">{watching.length}</span>}</summary>
                {watching.length > 0
                  ? <ul className="strip">{watching.map((w) => <li key={w.key}><Poster it={w} sub={w.sub} /></li>)}</ul>
                  : <p className="strip-empty">Mark a title as watching and it will show up here.</p>}
              </details>
            )}
            <Browse {...browse} /></div>
          <div hidden={view !== "connect"}>{connectOpened ? <Connect key={aKey} initialMode={connect.mode} initialA={connect.a} /> : null}</div>
        </div>
      </div>
    </>
  );
}
