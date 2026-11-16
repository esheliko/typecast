"use client";
import { useEffect, useState } from "react";
import { PeopleResult, TitlesResult } from "./Connect";
import { layoutSearch } from "@/lib/search-intent";
import type { PeopleLink, SearchHit, TitlesLink } from "@/lib/types";

type Res = { kind: "people"; r: PeopleLink } | { kind: "titles"; r: TitlesLink } | null;

const topOf = async (side: string, signal: AbortSignal): Promise<SearchHit | null> => {
  const r = await fetch(`/api/search?q=${encodeURIComponent(side)}&exact=1`, { signal });
  if (!r.ok) return null;
  return layoutSearch(side, (await r.json()).hits ?? []).top;
};

/** "A + B" typed in the main search box: the connection between two people or two titles, the same answer as the Connections tab. Shows nothing unless both sides are a clear match of the same kind. */
export default function PairConnect({ pair, onShown }: { pair: [string, string]; onShown?: (on: boolean) => void }) {
  const [res, setRes] = useState<Res>(null);
  const [busy, setBusy] = useState(false);
  const [a, b] = pair;
  useEffect(() => { onShown?.(!!res || busy); }, [res, busy, onShown]);
  useEffect(() => () => onShown?.(false), [onShown]);
  useEffect(() => {
    const ctl = new AbortController();
    setRes(null); setBusy(false);
    const t = setTimeout(async () => {
      try {
        const [x, y] = await Promise.all([topOf(a, ctl.signal), topOf(b, ctl.signal)]);
        if (!x || !y || x.kind !== y.kind) return;
        const id = (h: SearchHit) => (h.kind === "person" ? String(h.id) : h.key);
        if (id(x) === id(y)) return;
        setBusy(true);
        const r = await fetch(`/api/connect?${x.kind === "person" ? "people" : "titles"}=${id(x)},${id(y)}`, { signal: ctl.signal });
        if (!r.ok) { setBusy(false); return; }
        const j = await r.json();
        setRes(x.kind === "person" ? { kind: "people", r: j } : { kind: "titles", r: j });
        setBusy(false);
      } catch { /* aborted or failed: the normal results still show */ }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [a, b]);
  if (busy) return <p className="muted" style={{ marginTop: 16 }}><span className="spin" aria-hidden="true" />Comparing</p>;
  if (!res) return null;
  return (
    <div className="pair-answer">
      <p className="row-sub" style={{ marginTop: 16 }}>Connection</p>
      {res.kind === "people" ? <PeopleResult r={res.r} /> : <TitlesResult r={res.r} />}
    </div>
  );
}
