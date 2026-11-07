"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar, Thumb } from "./ui";
import { href, typeLabel } from "@/lib/img";
import { STATUS_LABEL, type SearchHit, type Status } from "@/lib/types";

export default function Search({ lib }: { lib: Record<string, Status> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); setState("idle"); return; }
    const mine = ++seq.current;
    setState("loading");
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        if (mine !== seq.current) return;
        if (!r.ok) throw new Error(j.error ?? "Search failed.");
        setHits(j.hits); setState("idle");
      } catch (e) { if (mine === seq.current) { setError((e as Error).message); setState("error"); } }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <input type="search" aria-label="Search films, series and people" placeholder="Search a film, series or actor" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" autoComplete="off" />
        </div>
      </form>
      {state === "loading" && <p className="muted" style={{ marginTop: 20 }}><span className="spin" />Searching</p>}
      {state === "error" && <p className="err" style={{ marginTop: 20 }}>{error}</p>}
      {hits && state !== "error" && (
        <div className="results">
          {hits.length === 0 ? <p className="muted" style={{ marginTop: 20 }}>Nothing found for &quot;{q.trim()}&quot;.</p> : (
            <>
              <h2>Results</h2>
              <div className="card"><ul className="rows">
                {hits.map((h) => h.kind === "person" ? (
                  <li key={`p${h.id}`}><Link className="row" href={`/person/${h.id}`}>
                    <Avatar photo={h.photo} name={h.name} />
                    <span className="row-main"><span className="row-title">{h.name}</span><span className="row-sub">{h.dept || "Person"}{h.knownFor.length ? ` · ${h.knownFor.join(", ")}` : ""}</span></span>
                  </Link></li>
                ) : (
                  <li key={h.key}><Link className="row" href={href(h.key)}>
                    <Thumb path={h.poster} />
                    <span className="row-main"><span className="row-title">{h.title}</span><span className="row-sub">{h.year} · {typeLabel(h.type)}</span></span>
                    {lib[h.key] && <span className={`pill ${lib[h.key]}`}>{STATUS_LABEL[lib[h.key]]}</span>}
                  </Link></li>
                ))}
              </ul></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
