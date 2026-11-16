"use client";
import { useEffect, useState } from "react";
import { PeopleResult, TitlesResult } from "./Connect";
import { layoutSearch, nameTier } from "@/lib/search-intent";
import type { PeopleLink, SearchHit, TitlesLink } from "@/lib/types";

type Res = { kind: "people"; r: PeopleLink } | { kind: "titles"; r: TitlesLink } | null;

const topOf = async (side: string, signal: AbortSignal): Promise<SearchHit | null> => {
  const r = await fetch(`/api/search?q=${encodeURIComponent(side)}&exact=1`, { signal });
  if (!r.ok) return null;
  return layoutSearch(side, (await r.json()).hits ?? []).top;
};

/** "A + B" typed in the main search box: the connection between two people or two titles, the same answer as the Connections tab. Shows nothing unless both sides are a clear match of the same kind. */
export default function PairConnect({ pair, cuts, onShown }: { pair?: [string, string] | null; cuts?: [string, string][]; onShown?: (on: boolean) => void }) {
  const [res, setRes] = useState<Res>(null);
  const [busy, setBusy] = useState(false);
  const key = pair ? pair.join("|") : (cuts ?? []).map((c) => c.join("|")).join("||");
  useEffect(() => { onShown?.(!!res || busy); }, [res, busy, onShown]);
  useEffect(() => () => onShown?.(false), [onShown]);
  useEffect(() => {
    const ctl = new AbortController();
    setRes(null); setBusy(false);
    const t = setTimeout(async () => {
      try {
        // A typed separator needs only a clear match per side; a guessed cut needs both sides to be an exact name.
        let x: SearchHit | null = null, y: SearchHit | null = null;
        const tops = new Map<string, Promise<SearchHit | null>>();
        const top = (s: string) => { let p = tops.get(s); if (!p) tops.set(s, (p = topOf(s, ctl.signal))); return p; };
        const exact = (h: SearchHit | null, s: string) => !!h && nameTier(s, h.kind === "person" ? h.name : h.title) === 4;
        if (pair) {
          [x, y] = await Promise.all([top(pair[0]), top(pair[1])]);
        } else {
          for (const [l, r] of cuts ?? []) {
            const [p, q] = await Promise.all([top(l), top(r)]);
            if (p && q && p.kind === q.kind && exact(p, l) && exact(q, r)) { x = p; y = q; break; }
          }
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (busy) return <p className="muted" style={{ marginTop: 16 }}><span className="spin" aria-hidden="true" />Comparing</p>;
  if (!res) return null;
  return (
    <div className="pair-answer">
      <p className="row-sub" style={{ marginTop: 16 }}>Connection</p>
      {res.kind === "people" ? <PeopleResult r={res.r} /> : <TitlesResult r={res.r} />}
    </div>
  );
}
