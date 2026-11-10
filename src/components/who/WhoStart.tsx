"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Photo } from "./bits";
import { typeLabel, urlParam } from "./start-util";
import type { SearchHit } from "@/lib/types";

/** /watching with no title: search for the film or series you are watching and start from it. */
export function WhoStart() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [err, setErr] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setHits(null); return; }
    let live = true;
    const h = setTimeout(() => {
      fetch(`/api/search?kind=title&q=${encodeURIComponent(t)}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (live) { setHits(j.hits ?? []); setErr(false); } }).catch(() => { if (live) setErr(true); });
    }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [q]);
  const titles = (hits ?? []).flatMap((h) => (h.kind === "title" ? [h] : [])).slice(0, 8);
  return (
    <div className="wx wx-start">
      <div className="wx-startbox">
        <span className="wbar-k"><span className="live-dot" aria-hidden="true" />Watching now</span>
        <h1 className="wx-startt">What are you watching?</h1>
        <input ref={input} type="search" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Search for a film or series" placeholder="Search a film or series…" autoComplete="off" />
        {err && <p className="small muted" role="alert">Couldn&rsquo;t search just now.</p>}
        {hits && !titles.length && !err && <p className="small muted">Nothing found.</p>}
        <ul className="wx-startlist">
          {titles.map((t) => (
            <li key={t.key}>
              <Link className="wx-starthit" href={`/who?k=${urlParam(t.key)}`}>
                <Photo path={t.poster} name={t.title} w="w92" className="wx-kpos" />
                <span><b>{t.title}</b> <span className="muted">{t.year}</span><span className="small muted wx-kline">{typeLabel(t.type)}</span></span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="small" href="/">Back to Typecast</Link>
      </div>
    </div>
  );
}
