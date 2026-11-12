"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Photo } from "./bits";
import { typeLabel, urlParam } from "./start-util";
import type { SearchHit } from "@/lib/types";
import type { ResumeCard } from "@/lib/watch-library";

/** /watching with no title: search for the film or series you are watching and start from it. */
export function WhoStart({ pickUp = [] }: { pickUp?: ResumeCard[] }) {
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
        {pickUp.length > 0 && (
          <section className="wx-resume" aria-label="Pick up where you left off">
            <h2 className="wx-resumet">Pick up where you left off</h2>
            <ul className="wx-resumel">
              {pickUp.map((c) => (
                <li key={c.key}>
                  <Link className="wx-resumec" href={c.href}>
                    <Photo path={c.poster} name={c.title} w="w92" className="wx-resumep" />
                    <span className="wx-resumex"><b>{c.title}</b>{c.place && <span className="small muted">{c.place}</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <input ref={input} type="search" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Search for a film or series" placeholder="Search a film or series…" autoComplete="off" />
        {err && <p className="small muted" role="alert">Couldn&rsquo;t search just now.</p>}
        {hits && !titles.length && !err && <p className="small muted">Nothing found.</p>}
        <ul className="wx-startlist">
          {titles.map((t) => (
            <li key={t.key}>
              <Link className="wx-starthit" href={`/watching?k=${urlParam(t.key)}`}>
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
