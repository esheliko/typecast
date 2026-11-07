"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./ui";
import { Poster } from "./cast/Browse";
import { useLib } from "./cast/LibState";
import type { SearchHit } from "@/lib/types";

/** Search box for the cast tab. While it has a query, its results take the place of the page below it. */
export default function Search({ onActive }: { onActive: (on: boolean) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();
  const { get } = useLib();

  useEffect(() => { onActive(term.length >= 2); }, [term, onActive]);
  useEffect(() => {
    if (term.length < 2) { setHits(null); setState("idle"); return; }
    const ctl = new AbortController();
    setState("loading");
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Search failed.");
        setHits(j.hits); setState("idle");
      } catch (e) { if ((e as Error).name !== "AbortError") { setError((e as Error).message); setState("error"); } }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term]);

  // "/" focuses search from anywhere on the page, as on most sites.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea,select")) { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  const people = hits?.filter((h) => h.kind === "person") ?? [];
  // Titles you have rated or noted come first, then other marked ones, then the rest (each group keeps TMDB's order).
  const rank = (k: string) => { const m = get(k); return m ? (m.rich ? 2 : 1) : 0; };
  const titles = (hits?.filter((h) => h.kind === "title") ?? []).map((h, i) => ({ h, i, r: h.kind === "title" ? rank(h.key) : 0 }))
    .sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.h);
  return (
    <>
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
        <div className="field">
          <input ref={input} type="search" aria-label="Search films, series and people" placeholder="Search a film, series or person" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} enterKeyHint="search" autoComplete="off" />
        </div>
      </form>
      {term.length >= 2 && (
        <div className="results">
          {state === "loading" && !hits && <p className="muted" style={{ marginTop: 20 }}><span className="spin" />Searching</p>}
          {state === "error" && <p className="err" style={{ marginTop: 20 }}>{error}</p>}
          {hits && state !== "error" && hits.length === 0 && <p className="muted" style={{ marginTop: 20 }}>Nothing found for &quot;{term}&quot;.</p>}
          {people.length > 0 && (
            <>
              <h2>People</h2>
              <div className="chips scroll people">
                {people.map((h) => h.kind === "person" && (
                  <Link key={h.id} className="person-chip" href={`/person/${h.id}`}>
                    <Avatar photo={h.photo} name={h.name} />
                    <span><span className="nm">{h.name}</span><span className="row-sub">{h.knownFor.slice(0, 2).join(", ") || h.dept}</span></span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {titles.length > 0 && (
            <>
              <h2>Films and series</h2>
              <ul className="grid">{titles.map((h) => h.kind === "title" && <li key={h.key}><Poster it={h} /></li>)}</ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
