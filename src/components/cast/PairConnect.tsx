"use client";
import { useEffect, useState } from "react";
import { PeopleResult, TitlesResult } from "./Connect";
import { TitleLink } from "../Modal";
import { Thumb } from "../ui";
import GoogleLink from "../who/GoogleLink";
import { exactTitle, layoutSearch, nameTier } from "@/lib/search-intent";
import { typeLabel } from "@/lib/img";
import type { Item, PeopleLink, SearchHit, TitlesLink } from "@/lib/types";

type Who = { id: number; name: string; photo: string | null; role: string };
type CharMatch = { show: Item; members: Who[] };
type Block = { id: string; kind: "people"; r: PeopleLink } | { id: string; kind: "titles"; r: TitlesLink } | { id: string; kind: "chars"; r: CharMatch[] };

/** `guess`: a side cut out of longer text; a little-known film that is named exactly still counts ("rumble fish matrix"). */
const topOf = async (side: string, signal: AbortSignal, guess = false): Promise<SearchHit | null> => {
  const r = await fetch(`/api/search?q=${encodeURIComponent(side)}&exact=1`, { signal });
  if (!r.ok) return null;
  const hits: SearchHit[] = (await r.json()).hits ?? [];
  return layoutSearch(side, hits).top ?? (guess ? exactTitle(side, hits) : null);
};
const getJson = async (url: string, signal: AbortSignal) => { const r = await fetch(url, { signal }); return r.ok ? r.json() : null; };

/**
 * "A + B" typed in the main search box: how two people, two titles or two characters ("sheldon + penny") connect, the same answer as the Connections tab.
 * Each answer is shown the moment it arrives; a spinner stays while others are still loading. Nothing shows unless an answer is found.
 */
export default function PairConnect({ pair, cuts, charText, onShown }: { pair?: [string, string] | null; cuts?: [string, string][]; /** No separator and no clear title or person: look for one show whose cast has every typed word ("nolan harper lucy tim"). */ charText?: string | null; onShown?: (on: boolean) => void }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pending, setPending] = useState(true);
  const key = pair ? pair.join("|") : (cuts ?? []).map((c) => c.join("|")).join("||") + "#" + (charText ?? "");
  // A typed separator is a sure sign of a connection, so the spinner shows at once; a guessed cut (no separator) stays silent until something is found.
  const spin = pending && (blocks.length > 0 || !!pair || !!charText);
  useEffect(() => { onShown?.(blocks.length > 0 || spin); }, [blocks, spin, onShown]);
  useEffect(() => () => onShown?.(false), [onShown]);
  useEffect(() => {
    const ctl = new AbortController();
    setBlocks([]); setPending(true);
    const add = (blk: Block | null) => { if (blk && !ctl.signal.aborted) setBlocks((cur) => (cur.some((x) => x.id === blk.id) ? cur : [...cur, blk])); };
    const t = setTimeout(async () => {
      try {
        // A typed separator needs only a clear match per side; a guessed cut needs both sides to be an exact name.
        let x: SearchHit | null = null, y: SearchHit | null = null;
        const tops = new Map<string, Promise<SearchHit | null>>();
        const top = (s: string) => { let p = tops.get(s); if (!p) tops.set(s, (p = topOf(s, ctl.signal, !pair))); return p; };
        const exact = (h: SearchHit | null, s: string) => !!h && nameTier(s, h.kind === "person" ? h.name : h.title) === 4;
        if (pair) {
          [x, y] = await Promise.all([top(pair[0]), top(pair[1])]);
        } else {
          for (const [l, r] of cuts ?? []) {
            const [p, q] = await Promise.all([top(l), top(r)]);
            if (p && q && p.kind === q.kind && exact(p, l) && exact(q, r)) { x = p; y = q; break; }
          }
        }
        const jobs: Promise<void>[] = [];
        const id = (h: SearchHit) => (h.kind === "person" ? String(h.id) : h.key);
        // Two people or two titles named outright: the plain connection.
        if (x && y && x.kind === y.kind && id(x) !== id(y)) {
          const person = x.kind === "person";
          jobs.push(getJson(`/api/connect?${person ? "people" : "titles"}=${id(x)},${id(y)}`, ctl.signal)
            .then((j) => add(j && (person ? { id: "p", kind: "people", r: j } : { id: "t", kind: "titles", r: j }))).catch(() => {}));
        }
        // With a typed separator, the sides may also be characters of one show ("sheldon + penny"); skipped when both are clearly famous people or both are titles.
        const named = !!x && !!y && x.kind === y.kind && (x.kind === "title" || ((x.pop ?? 0) >= 5 && ((y as typeof x).pop ?? 0) >= 5));
        if (pair && !named) {
          jobs.push(getJson(`/api/connect/characters?a=${encodeURIComponent(pair[0])}&b=${encodeURIComponent(pair[1])}`, ctl.signal)
            .then((j) => add(j?.matches?.length ? { id: "c", kind: "chars", r: j.matches } : null)).catch(() => {}));
        }
        // No separator, nothing clear: the words may be characters of one show ("sheldon penny", "ted mosby", "nolan harper lucy tim").
        if (!pair && charText && !jobs.length) {
          jobs.push(getJson(`/api/connect/characters?q=${encodeURIComponent(charText)}`, ctl.signal)
            .then((j) => add(j?.matches?.length ? { id: "c", kind: "chars", r: j.matches } : null)).catch(() => {}));
        }
        await Promise.all(jobs);
      } catch { /* aborted or failed: the normal results still show */ }
      if (!ctl.signal.aborted) setPending(false);
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const text = pair ? pair.join(" ") : charText ?? (cuts?.[0] ?? []).join(" ");
  if (!blocks.length && !spin) return pair && !pending ? <div className="pair-answer"><p className="muted" style={{ marginTop: 16 }}>No connection found for these two.</p><GoogleLink term={text} suffix=" connection" /></div> : null;
  return (
    <div className="pair-answer">
      <p className="row-sub" style={{ marginTop: 16 }}>Connection</p>
      {blocks.map((k) => k.kind === "people" ? <PeopleResult key={k.id} r={k.r} /> : k.kind === "titles" ? <TitlesResult key={k.id} r={k.r} /> : <CharsResult key={k.id} r={k.r} />)}
      {spin && <p className="muted" style={{ marginTop: 16 }}><span className="spin" aria-hidden="true" />{blocks.length ? "Looking for more" : "Looking for a connection"}</p>}
      {!pending && text && <GoogleLink term={text} suffix=" connection" />}
    </div>
  );
}

function CharsResult({ r }: { r: CharMatch[] }) {
  return (
    <>
      <h2>{r[0]?.members.length > 1 ? "Together in" : "Played by"}</h2>
      <div className="card"><ul className="rows">
        {r.map((m) => (
          <li key={m.show.key} className="row conn-row">
            <TitleLink k={m.show.key} it={m.show} className="row-link"><Thumb path={m.show.poster} />
              <span className="row-main">
                <span className="row-title" style={{ fontSize: 17 }}>{m.show.title}</span>
                <span className="row-sub">{m.show.year} · {typeLabel(m.show.type)}</span>
                {m.members.map((w) => <span key={w.id} className="row-sub"><b>{w.role}</b>: {w.name}</span>)}
              </span>
            </TitleLink>
          </li>
        ))}
      </ul></div>
    </>
  );
}
